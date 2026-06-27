# FigureShift Slice 4 — Push to TWDB + State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Push a reviewed machine to TWDB (create gallery with cover/type-sample/gallery photos + freeform links; or incrementally add new gallery photos), recording idempotent state in `machine.twdb.yaml`. Per-machine and "push all ready."

**Architecture:** Mirrors DT's `twdbPush` exactly, adapted to FigureShift's on-disk YAML state. Pure, unit-tested planning helpers (`partitionPhotos`, `missingPushFields`, `newGalleryPhotos`, `pushLinks`) in the main process; an orchestrator (`pushMachine`) that calls twdb-client `createMachine`/`addPhoto`/`setLinks`/`listMachinePhotos` and writes `machine.twdb.yaml`; IPC + UI (a Push button with readiness, a links editor, "push all ready", and a "View on TWDB" external link). Idempotency: `twdbUrl`/`galleryId` are written immediately after create, so a mid-push failure never re-creates; re-push only `addPhoto`s gallery files lacking a `twdbPhotoId`. No edits to existing galleries in v1.

**Tech Stack:** Electron (`shell.openExternal`), React 19, TypeScript, Vitest, `@joelberger/twdb-client@0.4.0` (main process uses the full client; renderer still only `/validate`). Build/test on default Node.

**Decisions baked in:** collection is **settable per machine** (`'My Collection' | 'Parting Out' | 'Sightings'`), default **My Collection**; required-to-push = make, model, TWDB-valid year, description, **serial number**, cover photo (mirrors DT; the genuine no-serial-model exception is handled after the live test confirms what TWDB accepts — collector types a placeholder for now); links = freeform `machine.yaml` `links: [{name, url}]`. **Edit/update of existing galleries is a prioritized fast-follow (the very next work after this slice)** — users will expect to fix mistakes. **Live testing hits real TWDB — be a good citizen: test with ONE machine, no spamming.**

**Execution note:** branch `feat/slice4-push-state` (don't commit to `main`). Push is destructive/outward — the live verification (Task 5) is the user's, against a single real machine they choose.

## twdb-client API (confirmed)

- `createMachine({ collection, brand, model, year, serialNo, description, coverImage?, typeSampleImage? }): Promise<{ id, url }>` — `brand`/`model` accept name strings; `coverImage`/`typeSampleImage` are `ImageSource` (a file path), resized by the client.
- `addPhoto(galleryId, image /* path */, { description }): Promise<{ photoId }>` (no URL in the response).
- `listMachinePhotos(galleryId): Promise<{ photoId, url }[]>` — recover URLs + the cover's id.
- `setLinks(galleryId, { name, url }[]): Promise<void>`.

---

### Task 1: `links` field + pure push-planning helpers

**Files:**
- Modify: `src/main/machineYaml.ts` (add `links?` to `MachineDoc`)
- Create: `src/main/pushPlan.ts`
- Test: `src/main/pushPlan.test.ts`

- [ ] **Step 1: Branch**

```bash
cd /Users/joelberger/Programs/Node/figureshift && git checkout -b feat/slice4-push-state
```

- [ ] **Step 2: Add `links` + `collection` to `MachineDoc`** in `src/main/machineYaml.ts`

At the top, import the TWDB collection type (type-only):

```ts
import type { Collection } from '@joelberger/twdb-client';
```

Add a link type above `MachineDoc`:

```ts
export interface MachineLink {
  name: string;
  url: string;
}
```

and inside `MachineDoc` (after `description?`):

```ts
  collection?: Collection; // 'My Collection' | 'Parting Out' | 'Sightings'; defaults to 'My Collection' on push
  links?: MachineLink[];
```

- [ ] **Step 3: Write the failing test** — `src/main/pushPlan.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { partitionPhotos, missingPushFields, newGalleryPhotos, pushLinks } from './pushPlan';
import type { MachineDoc, MachinePhoto, TwdbDoc } from './machineYaml';

const photos: MachinePhoto[] = [
  { file: 'cover.jpg', role: 'cover' },
  { file: 'ts.jpg', role: 'typeSample' },
  { file: 'g1.jpg', role: 'gallery' },
  { file: 'g2.jpg', role: 'gallery' },
  { file: 'x.jpg', role: 'skip' },
];

const full: MachineDoc = {
  make: 'Royal',
  model: 'Quiet De Luxe',
  year: '1948',
  serialNo: 'A-123456',
  description: 'nice',
  photos,
};

describe('partitionPhotos', () => {
  it('splits by explicit role, excluding skip', () => {
    const p = partitionPhotos(photos);
    expect(p.cover?.file).toBe('cover.jpg');
    expect(p.typeSample?.file).toBe('ts.jpg');
    expect(p.gallery.map((g) => g.file)).toEqual(['g1.jpg', 'g2.jpg']);
  });
});

describe('missingPushFields', () => {
  it('passes a complete machine', () => {
    expect(missingPushFields(full)).toEqual([]);
  });
  it('flags each missing requirement (serial IS required)', () => {
    expect(missingPushFields({ ...full, make: '' })).toContain('make');
    expect(missingPushFields({ ...full, model: '' })).toContain('model');
    expect(missingPushFields({ ...full, description: '' })).toContain('description');
    expect(missingPushFields({ ...full, year: '19zz' })).toContain('a TWDB-valid year');
    expect(missingPushFields({ ...full, serialNo: '' })).toContain('a serial number');
    expect(missingPushFields({ ...full, photos: photos.filter((p) => p.role !== 'cover') })).toContain('a cover photo');
  });
});

describe('newGalleryPhotos', () => {
  it('returns gallery photos not yet pushed (no twdbPhotoId in state)', () => {
    const state: TwdbDoc = { photos: { 'g1.jpg': { twdbPhotoId: '111' } } };
    const gallery = partitionPhotos(photos).gallery;
    expect(newGalleryPhotos(gallery, state).map((p) => p.file)).toEqual(['g2.jpg']);
  });
});

describe('pushLinks', () => {
  it('returns valid links, dropping blanks', () => {
    expect(
      pushLinks({ ...full, links: [{ name: 'YouTube', url: 'https://y' }, { name: '', url: 'x' }, { name: 'n', url: '' }] }),
    ).toEqual([{ name: 'YouTube', url: 'https://y' }]);
    expect(pushLinks(full)).toEqual([]);
  });
});
```

- [ ] **Step 4: Run, verify it fails** — `npx vitest run src/main/pushPlan.test.ts` → FAIL (module missing).

- [ ] **Step 5: Implement `src/main/pushPlan.ts`**

```ts
import { isValidTwdbYear } from '@joelberger/twdb-client';
import type { MachineDoc, MachineLink, MachinePhoto, TwdbDoc } from './machineYaml';

export interface PhotoPlan {
  cover: MachinePhoto | null;
  typeSample: MachinePhoto | null;
  gallery: MachinePhoto[];
}

// Partition by explicit role (skip excluded). cover/typeSample are exclusive (enforced in the UI).
export function partitionPhotos(photos: MachinePhoto[]): PhotoPlan {
  return {
    cover: photos.find((p) => p.role === 'cover') ?? null,
    typeSample: photos.find((p) => p.role === 'typeSample') ?? null,
    gallery: photos.filter((p) => p.role === 'gallery'),
  };
}

// Required for a TWDB create: make, model, valid year, serial number, description, a cover photo.
// (Some makes — e.g. Bing — genuinely lack serials; that exception is handled after the live test.)
export function missingPushFields(doc: MachineDoc): string[] {
  const missing: string[] = [];
  if (!doc.make?.trim()) missing.push('make');
  if (!doc.model?.trim()) missing.push('model');
  if (!doc.year || !isValidTwdbYear(doc.year)) missing.push('a TWDB-valid year');
  if (!doc.serialNo?.trim()) missing.push('a serial number');
  if (!doc.description?.trim()) missing.push('description');
  if (!partitionPhotos(doc.photos).cover) missing.push('a cover photo');
  return missing;
}

// Gallery photos not yet on TWDB (no recorded twdbPhotoId) — the incremental add set.
export function newGalleryPhotos(gallery: MachinePhoto[], state: TwdbDoc): MachinePhoto[] {
  return gallery.filter((p) => !state.photos[p.file]?.twdbPhotoId);
}

// Freeform links to attach, dropping entries missing a name or url.
export function pushLinks(doc: MachineDoc): MachineLink[] {
  return (doc.links ?? []).filter((l) => l.name?.trim() && l.url?.trim());
}
```

- [ ] **Step 6: Run, verify it passes** — `npx vitest run src/main/pushPlan.test.ts` → PASS. Then `npm test` (all green) + `npx tsc --noEmit` (0).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: machine.yaml links + pure push-planning helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `pushMachine` orchestrator (mirrors DT's twdbPush)

**Files:**
- Create: `src/main/push.ts`

- [ ] **Step 1: Implement `src/main/push.ts`**

```ts
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { TwdbClient } from '@joelberger/twdb-client';
import {
  readMachineYaml,
  readTwdbYaml,
  writeTwdbYaml,
  type MachinePhoto,
  type TwdbDoc,
} from './machineYaml';
import { partitionPhotos, missingPushFields, newGalleryPhotos, pushLinks } from './pushPlan';

export class PushValidationError extends Error {}

export interface PushResult {
  created: boolean;
  photosUploaded: number;
  url: string;
}

const DEFAULT_COLLECTION = 'My Collection' as const;

const hashFile = (abs: string) => createHash('sha256').update(readFileSync(abs)).digest('hex');

async function safeAddPhoto(client: TwdbClient, galleryId: string, abs: string): Promise<string | null> {
  try {
    const r = await client.addPhoto(galleryId, abs, { description: '' });
    return r.photoId;
  } catch (err) {
    console.warn('TWDB addPhoto failed', abs, String(err));
    return null;
  }
}

// Push one machine. Creates the gallery (cover/type-sample via createMachine, gallery via addPhoto,
// plus links) on first push; on later pushes only adds gallery photos lacking a twdbPhotoId.
// Writes twdbUrl/galleryId immediately after create for machine-level idempotency.
export async function pushMachine(client: TwdbClient, absPath: string): Promise<PushResult> {
  const doc = readMachineYaml(absPath);
  const state = readTwdbYaml(absPath);

  const missing = missingPushFields(doc);
  if (missing.length) throw new PushValidationError(`Cannot push — missing: ${missing.join(', ')}`);

  const plan = partitionPhotos(doc.photos);
  const abs = (p: MachinePhoto) => path.join(absPath, p.file);

  const created = !state.twdbUrl;
  let galleryId: string;
  let url: string;
  const uploaded: { file: string; photoId: string }[] = [];

  if (created) {
    const ref = await client.createMachine({
      collection: doc.collection ?? DEFAULT_COLLECTION,
      brand: doc.make as string,
      model: doc.model as string,
      year: doc.year as string,
      serialNo: doc.serialNo ?? '',
      description: doc.description ?? '',
      coverImage: plan.cover ? abs(plan.cover) : undefined,
      typeSampleImage: plan.typeSample ? abs(plan.typeSample) : undefined,
    });
    galleryId = ref.id;
    url = ref.url;
    // Idempotency: persist immediately so a later failure never re-creates the gallery.
    writeTwdbYaml(absPath, { ...state, twdbUrl: url, galleryId });
    for (const p of plan.gallery) {
      const id = await safeAddPhoto(client, galleryId, abs(p));
      if (id) uploaded.push({ file: p.file, photoId: id });
    }
  } else {
    url = state.twdbUrl as string;
    galleryId = state.galleryId ?? '';
    if (!galleryId) throw new Error(`No galleryId recorded for ${absPath}`);
    for (const p of newGalleryPhotos(plan.gallery, state)) {
      const id = await safeAddPhoto(client, galleryId, abs(p));
      if (id) uploaded.push({ file: p.file, photoId: id });
    }
  }

  const photos: TwdbDoc['photos'] = { ...state.photos };
  // Record content hashes for create-time photos (cover/type-sample) even when their id isn't recoverable.
  if (created && plan.cover) photos[plan.cover.file] = { ...photos[plan.cover.file], hash: hashFile(abs(plan.cover)) };
  if (created && plan.typeSample)
    photos[plan.typeSample.file] = { ...photos[plan.typeSample.file], hash: hashFile(abs(plan.typeSample)) };

  if (uploaded.length > 0 || (created && plan.cover)) {
    const list = await client.listMachinePhotos(galleryId);
    const urlById = new Map(list.map((p) => [p.photoId, p.url]));
    const addedIds = new Set(uploaded.map((u) => u.photoId));
    for (const u of uploaded) {
      photos[u.file] = {
        twdbPhotoId: u.photoId,
        twdbPhotoUrl: urlById.get(u.photoId) ?? '',
        hash: hashFile(path.join(absPath, u.file)),
      };
    }
    // The cover (sent via createMachine) returns no id; it's the single listed id we didn't add.
    // Only assign when unambiguous (mirrors DT; type-sample id is a separate slot, deferred).
    if (created && plan.cover) {
      const unmapped = list.map((p) => p.photoId).filter((pid) => !addedIds.has(pid));
      if (unmapped.length === 1) {
        photos[plan.cover.file] = {
          ...photos[plan.cover.file],
          twdbPhotoId: unmapped[0],
          twdbPhotoUrl: urlById.get(unmapped[0]) ?? '',
        };
      } else {
        console.warn('TWDB push: could not uniquely identify the cover photo id; left unset');
      }
    }
  }

  if (created) {
    const links = pushLinks(doc);
    if (links.length) await client.setLinks(galleryId, links);
  }

  writeTwdbYaml(absPath, { twdbUrl: url, galleryId, photos, lastPushedAt: new Date().toISOString() });

  const photosUploaded = created
    ? (plan.cover ? 1 : 0) + (plan.typeSample ? 1 : 0) + uploaded.length
    : uploaded.length;
  return { created, photosUploaded, url };
}
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → 0.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: pushMachine orchestrator (create / incremental add, state, links)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: IPC + preload + types

**Files:**
- Modify: `src/main.ts`, `src/preload.ts`, `src/figureshift.d.ts`

- [ ] **Step 1: `src/main.ts`** — import `shell` (add to the `electron` import) and `pushMachine`, then add handlers (near the other `ipcMain.handle`s):

```ts
import { pushMachine } from './main/push';
// add `shell` to: import { app, BrowserWindow, dialog, ipcMain, protocol, net, shell } from 'electron';

ipcMain.handle('machine:push', async (_event, absPath: string) => {
  if (!client) return { ok: false as const, message: 'Not logged in.' };
  try {
    const res = await pushMachine(client, absPath);
    return { ok: true as const, ...res };
  } catch (err) {
    return { ok: false as const, message: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('app:openExternal', (_event, url: string) => shell.openExternal(url));
```

- [ ] **Step 2: `src/preload.ts`** — add to the exposed object:

```ts
  push: (absPath: string) => ipcRenderer.invoke('machine:push', absPath),
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
```

- [ ] **Step 3: `src/figureshift.d.ts`** — add to the `figureshift` interface:

```ts
      push: (absPath: string) => Promise<
        { ok: true; created: boolean; photosUploaded: number; url: string } | { ok: false; message: string }
      >;
      openExternal: (url: string) => Promise<void>;
```

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit` → 0. **Commit:** `feat: machine:push + openExternal IPC`.

---

### Task 4: UI — links editor, readiness, Push button, push-all, View-on-TWDB

**Files:**
- Modify: `src/renderer/MachineEditor.tsx`, `src/renderer/ReviewScreen.tsx`, `src/renderer/MachineList.tsx`

- [ ] **Step 1: MachineEditor — readiness + links editor + Push button**

Add this renderer-safe readiness check near the top of `MachineEditor.tsx` (it can't import the main-process `missingPushFields`, which pulls in the Node client):

```ts
import { isValidTwdbYear } from '@joelberger/twdb-client/validate';
import type { Collection } from '@joelberger/twdb-client';
import type { MachineLink } from '../main/machineYaml';

function missing(doc: MachineDoc): string[] {
  const m: string[] = [];
  if (!doc.make?.trim()) m.push('make');
  if (!doc.model?.trim()) m.push('model');
  if (!doc.year || !isValidTwdbYear(doc.year)) m.push('a valid year');
  if (!doc.serialNo?.trim()) m.push('a serial number');
  if (!doc.description?.trim()) m.push('description');
  if (!doc.photos.some((p) => p.role === 'cover')) m.push('a cover photo');
  return m;
}
```

Add a **Collection** dropdown to the metadata form (e.g. just after the Make field), defaulting to "My Collection":

```tsx
      <label style={{ display: 'block', marginBottom: 8 }}>
        Collection
        <select
          value={doc.collection ?? 'My Collection'}
          onChange={(e) => setDoc((d) => ({ ...d, collection: e.target.value as Collection }))}
          style={{ width: '100%' }}
        >
          <option value="My Collection">My Collection</option>
          <option value="Parting Out">Parting Out</option>
          <option value="Sightings">Sightings</option>
        </select>
      </label>
```

Add push state to the component:

```ts
  const [pushMsg, setPushMsg] = useState('');
  const [pushedUrl, setPushedUrl] = useState(machine.status === 'onTwdb' ? 'onTwdb' : '');
  const gaps = missing(doc);

  async function push() {
    setPushMsg('Pushing to TWDB…');
    const res = await window.figureshift.push(machine.absPath);
    if (res.ok) {
      setPushMsg(`${res.created ? 'Created' : 'Updated'} on TWDB — ${res.photosUploaded} photo(s) uploaded.`);
      setPushedUrl(res.url);
      onPushed();
    } else {
      setPushMsg(`Push failed: ${res.message}`);
    }
  }

  const addLink = () => setDoc((d) => ({ ...d, links: [...(d.links ?? []), { name: '', url: '' }] }));
  const setLink = (i: number, k: keyof MachineLink, v: string) =>
    setDoc((d) => ({ ...d, links: (d.links ?? []).map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));
  const removeLink = (i: number) =>
    setDoc((d) => ({ ...d, links: (d.links ?? []).filter((_, j) => j !== i) }));
```

Extend the props to accept `onPushed`:

```ts
export function MachineEditor({
  machine,
  brands,
  onSaved,
  onPushed,
}: {
  machine: ScannedMachine;
  brands: string[];
  onSaved: (doc: MachineDoc) => void;
  onPushed: () => void;
}) {
```

Add a links section (before the `<PhotoGrid>`), and a push section (after the Save button):

```tsx
      <fieldset style={{ marginBottom: 8 }}>
        <legend>Links (optional)</legend>
        {(doc.links ?? []).map((l, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
            <input placeholder="name" value={l.name} onChange={(e) => setLink(i, 'name', e.target.value)} />
            <input placeholder="https://…" value={l.url} onChange={(e) => setLink(i, 'url', e.target.value)} style={{ flex: 1 }} />
            <button type="button" onClick={() => removeLink(i)}>✕</button>
          </div>
        ))}
        <button type="button" onClick={addLink}>+ add link</button>
      </fieldset>
```

```tsx
      <hr />
      <div>
        <button onClick={push} disabled={gaps.length > 0 || saving} title={gaps.length ? `Needs: ${gaps.join(', ')}` : ''}>
          {machine.status === 'onTwdb' ? 'Push new photos' : 'Push to TWDB'}
        </button>
        {gaps.length > 0 && <span style={{ color: '#a60', marginLeft: 8 }}>Needs: {gaps.join(', ')}</span>}
        {pushMsg && <p>{pushMsg}</p>}
        {pushedUrl && pushedUrl !== 'onTwdb' && (
          <button onClick={() => window.figureshift.openExternal(pushedUrl)}>View on TWDB ↗</button>
        )}
      </div>
```

(Save before push: a machine should be saved so `machine.yaml` on disk matches the form. The push reads from disk — so the Push handler in Step 2 below saves first.)

- [ ] **Step 2: Push reads disk — save before pushing.** In `push()` above, persist the current form first so disk matches the UI:

```ts
  async function push() {
    setPushMsg('Saving…');
    await window.figureshift.saveMachine(machine.absPath, doc);
    setPushMsg('Pushing to TWDB…');
    // …rest as above
  }
```

- [ ] **Step 3: ReviewScreen — wire `onPushed` + "push all ready"**

In `ReviewScreen.tsx`, add a status updater and a push-all loop:

```tsx
  const [pushAll, setPushAll] = useState('');

  function markPushed(i: number) {
    setMachines((ms) => ms.map((m, j) => (j === i ? { ...m, status: 'onTwdb' } : m)));
  }

  async function pushAllReady() {
    const targets = machines
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m.status === 'new');
    let done = 0;
    for (const { m, i } of targets) {
      setPushAll(`Pushing ${done + 1} of ${targets.length}: ${m.relPath}…`);
      const res = await window.figureshift.push(m.absPath);
      if (res.ok) markPushed(i);
      done++;
    }
    setPushAll(`Done — pushed ${done} machine(s).`);
  }
```

Render a push-all control above the editor (or in the list header) and pass `onPushed`:

```tsx
      <MachineEditor key={current.relPath} machine={current} brands={brands} onSaved={onSaved} onPushed={() => markPushed(selected)} />
```

Add to the list side (e.g., below `<MachineList>` or in a header bar):

```tsx
      <button onClick={pushAllReady}>Push all ready</button>
      {pushAll && <span>{pushAll}</span>}
```

(Place these so they're visible — e.g. wrap the left column in a `<div style={{display:'flex',flexDirection:'column'}}>` with the button under the list. Keep it simple.)

- [ ] **Step 4: Typecheck + tests** — `npx tsc --noEmit` (0), `npm test` (green).

- [ ] **Step 5: Commit:** `feat: push UI — readiness, links editor, push button, push-all, view link`.

---

### Task 5: Live verification (the user) — ONE machine

- [ ] **Step 1: Push a single real machine**

Run `npm start`, log in, pick the library, select **one** ready machine, click **Push to TWDB**. Expect: "Created on TWDB — N photo(s)", a **View on TWDB** button that opens the gallery in the browser, and a new `machine.twdb.yaml` in that folder with `twdbUrl`, `galleryId`, per-photo `twdbPhotoId`/`twdbPhotoUrl`/`hash`, and `lastPushedAt`. Verify the gallery on TWDB looks right (cover, type sample, gallery photos, links).

- [ ] **Step 2: Idempotency / incremental**

Click **Push new photos** again on the same machine → expect "Updated — 0 photo(s)" (nothing new) and **no duplicate gallery**. Optionally add a new gallery photo (drop a file in the folder, re-scan, set role gallery, save) and push → only that one uploads.

- [ ] **Step 3: Be a good citizen** — stop after verifying one (maybe two) machines; don't bulk-push during testing.

---

## After All Tasks

Run `npm test` (green) and use `superpowers:finishing-a-development-branch`. Update `figureshift-resume` memory: slice 4 done. **Next = slice 4.5 (fast-follow): edit/update existing galleries** — `updateMachine`/`updatePhoto` so users can fix metadata and corrections (people will expect this; surprising if absent). This is what makes the cover/type-sample photo-id capture matter, so revisit that reliability here. Then slice 5 (polish: progress, onboarding, error surfacing). The no-serial-model exception (e.g. Bing) is also handled once the live test reveals what TWDB accepts for an empty serial.

## Self-Review Notes

- **Spec coverage:** create (cover+type-sample+gallery+links) vs incremental add-new-photos; idempotency via immediate `twdbUrl`/`galleryId` write; per-photo id/url/hash + `lastPushedAt` in `machine.twdb.yaml`; per-machine + push-all; polite pacing inherited from twdb-client. No metadata/photo edits to existing galleries (v1).
- **Types consistent:** `MachineLink`/`MachineDoc`/`MachinePhoto`/`TwdbDoc` shared; `partitionPhotos`/`newGalleryPhotos`/`pushLinks`/`missingPushFields` signatures match `push.ts` usage; push IPC result type matches `figureshift.d.ts`.
- **Renderer safety:** the editor's readiness check uses only `@joelberger/twdb-client/validate`; the full client + `pushMachine` stay in main.
- **Good-citizen:** push is serialized by twdb-client's queue; live test limited to one machine; re-push is a no-op when nothing changed.
- **Known carry-over:** cover/type-sample `twdbPhotoId` capture is best-effort (mirrors DT's deferred gotcha) — only matters for future edit/delete, which is out of scope.
