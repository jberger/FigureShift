# FigureShift Slice 4.5 — Edit/Update Existing Galleries (metadata) Implementation Plan

> **For agentic workers:** small slice — execute inline. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let users fix corrections on a machine already on TWDB: re-pushing an `onTwdb` machine now updates its metadata (make/model/year/serial/description/collection) and refreshes links, in addition to adding any new gallery photos.

**Architecture:** Extend `pushMachine`'s incremental branch (when `twdbUrl` is set) to call `client.updateMachine(galleryId, fields)` with metadata only (no images → TWDB keeps the existing cover/type-sample). Move `setLinks` to run on both create and update so link edits propagate. Keep the stored `twdbUrl` unchanged (TWDB resolves any slug prefix by id, so a slug change from a year/model edit still resolves). Photo-level edit/delete + the photo-id/URL capture bug are a separate follow-up (out of scope).

**Tech Stack:** existing — `@joelberger/twdb-client@0.4.0` (`updateMachine`, `setLinks`).

**Scope note:** metadata only. No cover/type-sample replacement, no photo delete, no clearing of all links (removing every link won't un-set them on TWDB this round — edge, deferred). Out of scope: the cover/type-sample id + empty `twdbPhotoUrl` capture bug.

---

### Task 1: `updateMachine` on the incremental push path

**Files:**
- Modify: `src/main/push.ts`

- [ ] **Step 1: Branch** — `git checkout -b feat/slice4_5-metadata-update`

- [ ] **Step 2:** In `pushMachine`, the incremental (`else`) branch currently only adds new gallery photos. Add a metadata update before the photo loop, and **do not** overwrite `url` from its return (keep the stored canonical):

```ts
  } else {
    url = state.twdbUrl as string;
    galleryId = state.galleryId ?? '';
    if (!galleryId) throw new Error(`No galleryId recorded for ${absPath}`);
    // Propagate metadata edits. Metadata-only (no images) → TWDB keeps the existing cover/type-sample.
    // Keep the stored twdbUrl: a year/model edit changes the canonical slug, but any slug prefix
    // still resolves by id, so the existing url stays valid.
    await client.updateMachine(galleryId, {
      collection: doc.collection ?? DEFAULT_COLLECTION,
      brand: doc.make as string,
      model: doc.model as string,
      year: doc.year as string,
      serialNo: doc.serialNo ?? '',
      description: doc.description ?? '',
    });
    for (const p of newGalleryPhotos(plan.gallery, state)) {
      const id = await safeAddPhoto(client, galleryId, abs(p));
      if (id) uploaded.push({ file: p.file, photoId: id });
    }
  }
```

- [ ] **Step 3:** Move the links push out of the `if (created)` block so it runs on both create and update. Replace the existing:

```ts
  if (created) {
    const links = pushLinks(doc);
    if (links.length) await client.setLinks(galleryId, links);
  }
```

with (placed just before the final `writeTwdbYaml`):

```ts
  // Sync links on both create and update (setLinks replaces the gallery's links).
  const links = pushLinks(doc);
  if (links.length) await client.setLinks(galleryId, links);
```

- [ ] **Step 4:** Typecheck + tests — `npx tsc --noEmit` (0), `npm test` (green).

- [ ] **Step 5: Commit** — `feat: update gallery metadata on re-push (edit/correct existing machines)`

---

### Task 2: UI label

**Files:**
- Modify: `src/renderer/MachineEditor.tsx`

- [ ] **Step 1:** The push button label for an already-pushed machine says "Push new photos". Since re-push now also updates metadata, change it to "Update on TWDB":

```tsx
          {machine.status === 'onTwdb' ? 'Update on TWDB' : 'Push to TWDB'}
```

- [ ] **Step 2:** Typecheck (`npx tsc --noEmit` → 0). **Commit:** `feat: relabel re-push button to "Update on TWDB"`.

---

### Task 3: Live verification (the user)

- [ ] Edit the already-pushed Silver-Reed Electric 8700 (e.g. tweak the description or year), Save, click **Update on TWDB** → expect "Updated on TWDB — 0 photo(s)". Confirm on TWDB that the metadata changed and **the cover/type-sample/gallery photos are all still present** (not wiped). If you also add a new gallery photo + re-push, it should update metadata *and* add the one photo.

---

## After All Tasks

`npm test` green → `superpowers:finishing-a-development-branch`. Update `figureshift-resume`: slice 4.5 (metadata edit) done; next = the photo-id/URL capture bug + photo-level edit/delete, then slice 5 polish.

## Self-Review

- **Spec coverage:** edit/correct existing-gallery metadata via re-push; links refresh; photos kept (no images posted on update). Photo-level edit/delete + id-capture bug explicitly deferred.
- **Safety:** metadata-only `updateMachine` posts no image fields, so TWDB retains existing photos (verified in `#submitMachine`); stored `twdbUrl` retained (id-based resolution).
- **No new types/placeholders.**
