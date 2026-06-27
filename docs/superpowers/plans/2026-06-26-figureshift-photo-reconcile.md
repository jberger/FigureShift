# FigureShift — Photo Reconcile (captions + edit + delete) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Make a re-push fully reconcile a gallery's photos against `machine.yaml`: add new gallery photos **with their captions**, update changed captions (`updatePhoto`), and delete photos marked **skip** (`deletePhoto`) — dropping them from state.

**Architecture:** A pure `reconcilePhotos(doc, state)` computes the {adds, captionUpdates, deletes} diff (unit-tested). `pushMachine` consumes it: `addPhoto(caption)` / `updatePhoto(desc)` / `deletePhoto`, recording each gallery photo's `caption` in `machine.twdb.yaml` so future diffs work. cover/type-sample stay slot-managed (no per-photo caption API). Idempotency unchanged (twdbUrl/galleryId written right after create).

**Tech Stack:** existing — twdb-client 0.4.1 (`addPhoto`/`updatePhoto`/`deletePhoto`/`listMachinePhotos`).

**Scope:** gallery photos only (role `gallery`/`skip`). cover/type-sample captions and gallery↔cover role reassignment of already-pushed photos are out of scope. Live test hits real TWDB — one machine.

---

### Task 1: `caption` in state + pure `reconcilePhotos` (subagent)

**Files:** Modify `src/main/machineYaml.ts`; Modify `src/main/pushPlan.ts`; Test `src/main/pushPlan.test.ts`. Branch: `feat/photo-reconcile`.

- [ ] **Step 1:** In `machineYaml.ts`, add `caption?: string;` to the `TwdbPhotoState` interface.

- [ ] **Step 2 (failing test):** append to `pushPlan.test.ts`:

```ts
import { reconcilePhotos } from './pushPlan';

describe('reconcilePhotos', () => {
  const doc = (photos: MachinePhoto[]): MachineDoc => ({ make: 'R', model: 'M', year: '1948', serialNo: 's', description: 'd', photos });

  it('adds gallery photos with no id, flags caption changes, deletes skipped on-TWDB photos', () => {
    const photos: MachinePhoto[] = [
      { file: 'a.jpg', role: 'gallery', caption: 'new A' },        // on TWDB, caption changed -> update
      { file: 'b.jpg', role: 'gallery' },                          // not on TWDB -> add
      { file: 'c.jpg', role: 'skip' },                             // on TWDB but skip -> delete
      { file: 'd.jpg', role: 'gallery', caption: 'same' },         // on TWDB, caption unchanged -> noop
    ];
    const state: TwdbDoc = {
      photos: {
        'a.jpg': { twdbPhotoId: '1', caption: 'old A' },
        'c.jpg': { twdbPhotoId: '3' },
        'd.jpg': { twdbPhotoId: '4', caption: 'same' },
      },
    };
    const r = reconcilePhotos(doc(photos), state);
    expect(r.adds.map((p) => p.file)).toEqual(['b.jpg']);
    expect(r.captionUpdates).toEqual([{ file: 'a.jpg', photoId: '1', caption: 'new A' }]);
    expect(r.deletes).toEqual([{ file: 'c.jpg', photoId: '3' }]);
  });

  it('treats missing/empty captions as equal (no spurious update)', () => {
    const photos: MachinePhoto[] = [{ file: 'a.jpg', role: 'gallery' }];
    const state: TwdbDoc = { photos: { 'a.jpg': { twdbPhotoId: '1' } } };
    expect(reconcilePhotos(doc(photos), state).captionUpdates).toEqual([]);
  });
});
```

- [ ] **Step 3:** Run → fails (no `reconcilePhotos`).

- [ ] **Step 4:** Add to `pushPlan.ts`:

```ts
export interface PhotoReconcile {
  adds: MachinePhoto[];
  captionUpdates: { file: string; photoId: string; caption: string }[];
  deletes: { file: string; photoId: string }[];
}

// Diff machine.yaml photos against recorded TWDB state (gallery photos only):
//  - role 'gallery' with no twdbPhotoId  -> add
//  - role 'gallery' on TWDB, caption changed -> caption update
//  - role 'skip' that is on TWDB -> delete
export function reconcilePhotos(doc: MachineDoc, state: TwdbDoc): PhotoReconcile {
  const adds: MachinePhoto[] = [];
  const captionUpdates: PhotoReconcile['captionUpdates'] = [];
  const deletes: PhotoReconcile['deletes'] = [];
  for (const p of doc.photos) {
    const st = state.photos[p.file];
    if (p.role === 'gallery') {
      if (!st?.twdbPhotoId) adds.push(p);
      else if ((st.caption ?? '') !== (p.caption ?? ''))
        captionUpdates.push({ file: p.file, photoId: st.twdbPhotoId, caption: p.caption ?? '' });
    } else if (p.role === 'skip' && st?.twdbPhotoId) {
      deletes.push({ file: p.file, photoId: st.twdbPhotoId });
    }
  }
  return { adds, captionUpdates, deletes };
}
```

(`MachinePhoto` is already imported in pushPlan.ts.)

- [ ] **Step 5:** Run → pass. `npm test` + `npx tsc --noEmit` green. Commit: `feat: TwdbPhotoState.caption + pure reconcilePhotos`.

---

### Task 2: `pushMachine` uses the reconcile (controller)

**Files:** Modify `src/main/push.ts`.

- [ ] **Step 1:** Extend `PushResult` to `{ created: boolean; photosUploaded: number; updated: number; deleted: number; url: string }`.

- [ ] **Step 2:** Update `safeAddPhoto` to take a caption: `safeAddPhoto(client, galleryId, abs, caption)` → `client.addPhoto(galleryId, abs, { description: caption })`.

- [ ] **Step 3:** Replace the per-branch gallery loops + url block with a single reconcile after the create/update step. Full target shape of the photo section:

```ts
  // (created branch: createMachine + write twdbUrl/galleryId immediately, as before)
  // (incremental branch: updateMachine metadata, as before — keep stored url)

  const photos: TwdbDoc['photos'] = { ...state.photos };
  if (created && plan.cover) photos[plan.cover.file] = { ...photos[plan.cover.file], hash: hashFile(abs(plan.cover)) };
  if (created && plan.typeSample)
    photos[plan.typeSample.file] = { ...photos[plan.typeSample.file], hash: hashFile(abs(plan.typeSample)) };

  const { adds, captionUpdates, deletes } = reconcilePhotos(doc, { ...state, photos });
  const uploaded: { file: string; photoId: string; caption: string }[] = [];
  for (const p of adds) {
    const id = await safeAddPhoto(client, galleryId, abs(p), p.caption ?? '');
    if (id) uploaded.push({ file: p.file, photoId: id, caption: p.caption ?? '' });
  }
  let updated = 0;
  for (const u of captionUpdates) {
    await client.updatePhoto(galleryId, u.photoId, { description: u.caption });
    photos[u.file] = { ...photos[u.file], caption: u.caption };
    updated++;
  }
  let deleted = 0;
  for (const d of deletes) {
    await client.deletePhoto(galleryId, d.photoId);
    delete photos[d.file];
    deleted++;
  }
  if (uploaded.length > 0) {
    const list = await client.listMachinePhotos(galleryId);
    const urlById = new Map(list.map((p) => [p.photoId, p.url]));
    for (const u of uploaded) {
      photos[u.file] = {
        twdbPhotoId: u.photoId,
        twdbPhotoUrl: urlById.get(u.photoId) ?? '',
        hash: hashFile(path.join(absPath, u.file)),
        caption: u.caption,
      };
    }
  }

  const links = pushLinks(doc);
  if (links.length) await client.setLinks(galleryId, links);
  writeTwdbYaml(absPath, { twdbUrl: url, galleryId, photos, lastPushedAt: new Date().toISOString() });

  const photosUploaded = (created ? (plan.cover ? 1 : 0) + (plan.typeSample ? 1 : 0) : 0) + uploaded.length;
  return { created, photosUploaded, updated, deleted, url };
```

Import `reconcilePhotos` from `./pushPlan`. Remove the now-unused `newGalleryPhotos` import (keep the export in pushPlan; it stays tested).

- [ ] **Step 4:** `npx tsc --noEmit` (0), `npm test` (green). Commit: `feat: push reconciles photos (add+caption, updatePhoto, deletePhoto)`.

---

### Task 3: UI result wiring (controller)

**Files:** Modify `src/figureshift.d.ts`, `src/renderer/MachineEditor.tsx`.

- [ ] **Step 1:** In `figureshift.d.ts`, extend the push result shape: `{ ok: boolean; created?: boolean; photosUploaded?: number; updated?: number; deleted?: number; url?: string; message?: string }`.

- [ ] **Step 2:** In `MachineEditor.tsx` `push()`, on success set:

```ts
      setPushMsg(
        `${res.created ? 'Created' : 'Updated'} on TWDB — ${res.photosUploaded ?? 0} uploaded` +
          `, ${res.updated ?? 0} caption(s) updated, ${res.deleted ?? 0} deleted.`,
      );
```

- [ ] **Step 3:** `npx tsc --noEmit` (0), `npm test` (green). Commit: `feat: surface add/update/delete counts after push`.

---

### Task 4: Live verification (the user)

- [ ] On the already-pushed Silver-Reed: (a) add/change a **caption** on a gallery photo, (b) mark one gallery photo **skip**, (c) optionally drop a new image in the folder, re-scan, set it **gallery**. Save → **Update on TWDB**. Expect a message like "Updated — 1 uploaded, 1 caption(s) updated, 1 deleted", and on TWDB: the caption changed, the skipped photo is gone, the new one present. Re-push again → all zeros (no-op). Confirm `machine.twdb.yaml` reflects it (deleted file removed; captions stored).

---

## After All Tasks

`npm test` green → `superpowers:finishing-a-development-branch`. Update `figureshift-resume`: photo reconcile done; next = slice 5 polish (progress, onboarding, error surfacing) + leftover TODOs (clear-all-links on update, no-serial exception, optional URL backfill).

## Self-Review

- **Spec coverage:** captions on add (`addPhoto` description), caption edits (`updatePhoto`), delete via skip (`deletePhoto`), state records caption for diffing. Full-reconcile scope chosen.
- **Types:** `PhotoReconcile`, `TwdbPhotoState.caption`, `PushResult` (+updated/deleted), push IPC result all consistent.
- **Idempotency:** re-push with no changes → adds/updates/deletes all empty → no TWDB writes except the (cheap) updateMachine metadata on incremental; acceptable.
