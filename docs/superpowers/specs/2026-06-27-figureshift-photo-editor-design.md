# FigureShift — In-app Photo Editor design

**Date:** 2026-06-27
**Status:** Approved (design).

## Goal

A minimal in-app photo editor (modal) so users can **crop** and **rotate/straighten** (and zoom) a machine's photos before pushing, without leaving FigureShift or touching another tool.

## UI / trigger

- Each photo card in the grid gains an **"Edit" button**.
- It opens a **modal** containing:
  - A `react-easy-crop` stage: drag-to-pan, **zoom**, a draggable **crop frame** (free aspect).
  - **Rotate left / rotate right** (90° steps) buttons + a fine **straighten slider** (arbitrary degrees).
  - A radio: **Overwrite** / **Save as new (copy)** — defaults to **Save as new**.
  - **Save** and **Cancel**.

## Image pipeline (no taint, WYSIWYG)

- The modal loads the source by **`fetch()`-ing the `figimg://` URL → Blob → object URL** (figimg is registered `supportFetchAPI`/`secure`, so this works and the resulting `blob:` URL is same-origin — the export canvas is **not tainted**).
- On Save, the renderer renders the crop + rotation to a **canvas** (standard react-easy-crop "getCroppedImg" recipe) → a **JPEG Blob** → `ArrayBuffer`.
- The bytes are sent to main via a new IPC `photo:saveEdit({ dir, file, mode, bytes })`; **main just writes the file** (no `sharp` needed — the canvas already produced the exact pixels). Main validates `dir` is inside the scanned library root (same guard as `figimg`).

## File + state behavior

- **Save as new (default):** main writes `«base»-edited«ext»` into the folder, **uniquified** if it already exists (`-edited-2`, …), and returns the new filename. The editor then: adds the new file as a photo (**role `gallery`**), sets the **original to `skip`**, and **persists `machine.yaml`** (so disk + YAML stay consistent).
- **Overwrite:** main replaces the original file in place; the editor bumps a **thumbnail refresh key** (cache-bust appended to `figimg` URLs) so the grid re-renders the new image. `machine.yaml` is unchanged.

## Push integration

- **Nothing new.** Save-as-new on an already-pushed photo rides the **existing reconcile**: the skipped original → `deletePhoto`, the edited file → `addPhoto`. ✅
- **Overwrite-resync is explicitly deferred** (documented follow-on): overwriting a photo already on TWDB updates only the local file this slice; re-uploading it on push (via hash-diff → `updatePhoto(image)`) is a later addition.

## Tech / scope

- New dependency: **`react-easy-crop`** + a ~40-line `getCroppedImg` canvas helper.
- Scope: **crop + rotate/straighten + zoom only.** No brightness/filters/annotations/flip.

## Components / units

- `src/renderer/PhotoEditorModal.tsx` — the modal (cropper, controls, radio, save/cancel; does the fetch→blob load and canvas export).
- `src/renderer/PhotoGrid.tsx` — add the per-card "Edit" button + open the modal; apply the refresh key to thumbnail URLs; on save-as-new, update the photo list (add + skip original).
- `src/main.ts` — `photo:saveEdit` IPC (path-guarded write).
- `src/main/editFiles.ts` — pure **`editedFilename(original, existingNames)`** (uniquified `-edited` name). **Unit-tested.**

## Testing

- Pure `editedFilename` → Vitest. The canvas/cropper + IPC write are verified by eye in `npm start` (crop+rotate a photo, Save-as-new → edited appears + original skipped; Overwrite → thumbnail updates). Existing suites + `tsc` stay green.
