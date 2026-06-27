# FigureShift Photo Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A modal photo editor (crop, rotate/straighten, zoom) that writes the result back to disk as a new copy (default) or an overwrite.

**Architecture:** A renderer modal (`react-easy-crop`) loads the source via `fetch(figimg)→blob URL` (so the export canvas isn't cross-origin-tainted), renders crop+rotation to a canvas → JPEG bytes → `photo:saveEdit` IPC; main writes the file (path-guarded to the scanned root). Save-as-new uses a pure `editedFilename` helper, adds the file as a `gallery` photo, sets the original to `skip`, and persists `machine.yaml`. Overwrite replaces in place and the grid cache-busts its thumbnails.

**Tech Stack:** React 19, `react-easy-crop` (new dep), Electron IPC, TypeScript, Vitest.

## Global Constraints

- Build/test on the default Node; packaging (not needed here) uses Node 24.15.0.
- Renderer imports only browser-safe modules (no twdb-client main index, no `node:*`).
- `photo:saveEdit` must write only inside the scanned library root (same guard as `figimg`).
- Extensionless relative imports (`moduleResolution: bundler`).

---

### Task 1: pure `editedFilename` helper

**Files:**
- Create: `src/main/editFiles.ts`
- Test: `src/main/editFiles.test.ts`

**Interfaces:**
- Produces: `editedFilename(original: string, existing: string[]): string`

- [ ] **Step 1: Write the failing test** — `src/main/editFiles.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { editedFilename } from './editFiles';

describe('editedFilename', () => {
  it('appends -edited before the extension', () => {
    expect(editedFilename('IMG_1.jpg', [])).toBe('IMG_1-edited.jpg');
  });
  it('uniquifies when the name is taken', () => {
    expect(editedFilename('a.jpeg', ['a-edited.jpeg'])).toBe('a-edited-2.jpeg');
    expect(editedFilename('a.jpeg', ['a-edited.jpeg', 'a-edited-2.jpeg'])).toBe('a-edited-3.jpeg');
  });
  it('handles names with no extension', () => {
    expect(editedFilename('photo', [])).toBe('photo-edited');
  });
  it('is case-insensitive about collisions', () => {
    expect(editedFilename('A.JPG', ['a-edited.jpg'])).toBe('A-edited-2.JPG');
  });
});
```

- [ ] **Step 2: Run, verify it fails** — `npx vitest run src/main/editFiles.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** `src/main/editFiles.ts`

```ts
import path from 'node:path';

// «base»-edited«ext», uniquified against existing names (case-insensitive): -edited, -edited-2, ...
export function editedFilename(original: string, existing: string[]): string {
  const ext = path.extname(original);
  const base = original.slice(0, original.length - ext.length);
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  const candidate = (n: number) => `${base}-edited${n > 1 ? `-${n}` : ''}${ext}`;
  let n = 1;
  while (taken.has(candidate(n).toLowerCase())) n++;
  return candidate(n);
}
```

- [ ] **Step 4: Run, verify it passes** — `npx vitest run src/main/editFiles.test.ts` → PASS (4).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: pure editedFilename helper"` (add the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer).

---

### Task 2: `photo:saveEdit` IPC + dependency + preload + types

**Files:**
- Modify: `package.json` (add `react-easy-crop`)
- Modify: `src/main.ts` (handler), `src/preload.ts`, `src/figureshift.d.ts`

**Interfaces:**
- Consumes: `editedFilename` (Task 1); existing `scannedRoot` guard in `main.ts`.
- Produces: `window.figureshift.saveEdit({ dir, file, mode, bytes }) => Promise<{ ok: boolean; file?: string; message?: string }>` where `mode: 'overwrite' | 'new'`, `bytes: Uint8Array`.

- [ ] **Step 1: Install the cropper** — `npm install react-easy-crop` (run on the branch).

- [ ] **Step 2: Add the IPC handler in `src/main.ts`** — import `readdirSync` (extend the `node:fs` import) and `editedFilename`, then add near the other handlers:

```ts
import { editedFilename } from './main/editFiles';
// extend: import { writeFileSync, readdirSync } from 'node:fs';  (writeMachineYaml etc. already imported)

ipcMain.handle(
  'photo:saveEdit',
  async (_event, { dir, file, mode, bytes }: { dir: string; file: string; mode: 'overwrite' | 'new'; bytes: Uint8Array }) => {
    const absDir = path.resolve(dir);
    const ok = scannedRoot && (absDir === scannedRoot || absDir.startsWith(scannedRoot + path.sep));
    if (!ok) return { ok: false as const, message: 'Refusing to write outside the library.' };
    try {
      const outName = mode === 'overwrite' ? file : editedFilename(file, readdirSync(absDir));
      writeFileSync(path.join(absDir, outName), Buffer.from(bytes));
      return { ok: true as const, file: outName };
    } catch (err) {
      return { ok: false as const, message: err instanceof Error ? err.message : String(err) };
    }
  },
);
```

(`writeFileSync` may already be imported via `node:fs`; if not, add it. `path` and `scannedRoot` already exist in main.ts.)

- [ ] **Step 3: preload** — add to the `exposeInMainWorld('figureshift', {...})` object in `src/preload.ts`:

```ts
  saveEdit: (args: { dir: string; file: string; mode: 'overwrite' | 'new'; bytes: Uint8Array }) =>
    ipcRenderer.invoke('photo:saveEdit', args),
```

- [ ] **Step 4: types** — add to the `figureshift` interface in `src/figureshift.d.ts`:

```ts
      saveEdit: (args: {
        dir: string;
        file: string;
        mode: 'overwrite' | 'new';
        bytes: Uint8Array;
      }) => Promise<{ ok: boolean; file?: string; message?: string }>;
```

- [ ] **Step 5:** `npx tsc --noEmit` → 0. **Commit:** `feat: photo:saveEdit IPC (path-guarded) + react-easy-crop dep`.

---

### Task 3: canvas crop helper + PhotoEditorModal + modal CSS

**Files:**
- Create: `src/renderer/cropImage.ts`
- Create: `src/renderer/PhotoEditorModal.tsx`
- Modify: `src/index.css` (modal styles)

**Interfaces:**
- Consumes: `window.figureshift.saveEdit` (Task 2).
- Produces: `<PhotoEditorModal dir file onClose onEdited />`, where `onEdited(result: { mode: 'overwrite' | 'new'; originalFile: string; newFile?: string })`.
- `cropImage(src: string, area: { x:number; y:number; width:number; height:number }, rotation: number) => Promise<Blob>`

- [ ] **Step 1: Implement `src/renderer/cropImage.ts`** (standard react-easy-crop canvas recipe)

```ts
interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

const rad = (deg: number) => (deg * Math.PI) / 180;

// Render rotation + crop to a JPEG blob. `area` is in the rotated image's pixel space
// (react-easy-crop's croppedAreaPixels convention).
export async function cropImage(src: string, area: Area, rotation: number): Promise<Blob> {
  const image = await loadImage(src);
  const r = rad(rotation);
  const bW = Math.abs(Math.cos(r) * image.width) + Math.abs(Math.sin(r) * image.height);
  const bH = Math.abs(Math.sin(r) * image.width) + Math.abs(Math.cos(r) * image.height);

  const canvas = document.createElement('canvas');
  canvas.width = bW;
  canvas.height = bH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.translate(bW / 2, bH / 2);
  ctx.rotate(r);
  ctx.drawImage(image, -image.width / 2, -image.height / 2);

  const out = document.createElement('canvas');
  out.width = Math.round(area.width);
  out.height = Math.round(area.height);
  const octx = out.getContext('2d');
  if (!octx) throw new Error('no 2d context');
  octx.drawImage(canvas, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);

  return new Promise((resolve, reject) => {
    out.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.92);
  });
}
```

- [ ] **Step 2: Implement `src/renderer/PhotoEditorModal.tsx`**

```tsx
import { useEffect, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { cropImage } from './cropImage';

export type EditResult = { mode: 'overwrite' | 'new'; originalFile: string; newFile?: string };

export function PhotoEditorModal({
  dir,
  file,
  onClose,
  onEdited,
}: {
  dir: string;
  file: string;
  onClose: () => void;
  onEdited: (r: EditResult) => void;
}) {
  const [src, setSrc] = useState('');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [area, setArea] = useState<Area | null>(null);
  const [mode, setMode] = useState<'overwrite' | 'new'>('new');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Load via fetch->blob so the export canvas isn't cross-origin tainted.
  useEffect(() => {
    let url = '';
    let live = true;
    fetch(`figimg://f/${encodeURIComponent(`${dir}/${file}`)}`)
      .then((r) => r.blob())
      .then((b) => {
        if (!live) return;
        url = URL.createObjectURL(b);
        setSrc(url);
      })
      .catch(() => live && setErr('Could not load the image.'));
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [dir, file]);

  async function save() {
    if (!area) return;
    setBusy(true);
    setErr('');
    try {
      const blob = await cropImage(src, area, rotation);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const res = await window.figureshift.saveEdit({ dir, file, mode, bytes });
      if (!res.ok) {
        setErr(res.message ?? 'Save failed.');
        setBusy(false);
        return;
      }
      onEdited({ mode, originalFile: file, newFile: res.file });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Edit photo</h3>
        <div className="crop-stage">
          {src && (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={(_a, px) => setArea(px)}
            />
          )}
        </div>
        <div className="crop-controls">
          <button className="btn btn-secondary btn-sm" onClick={() => setRotation((r) => (r + 270) % 360)}>
            ⟲ Rotate left
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setRotation((r) => (r + 90) % 360)}>
            ⟳ Rotate right
          </button>
          <label>
            Rotation
            <input type="range" min={0} max={360} value={rotation} onChange={(e) => setRotation(Number(e.target.value))} />
          </label>
          <label>
            Zoom
            <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
          </label>
        </div>
        <div className="crop-save">
          <label className="remember">
            <input type="radio" name="savemode" checked={mode === 'new'} onChange={() => setMode('new')} /> Save as new (copy)
          </label>
          <label className="remember">
            <input type="radio" name="savemode" checked={mode === 'overwrite'} onChange={() => setMode('overwrite')} /> Overwrite
          </label>
        </div>
        {err && <p className="status error">{err}</p>}
        <div className="push-bar">
          <button className="btn btn-primary" onClick={save} disabled={busy || !area || !src}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add modal CSS to `src/index.css`** (append at the end)

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(31, 29, 27, 0.55);
  display: grid;
  place-items: center;
  z-index: 50;
  padding: 24px;
}
.modal {
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 20px;
  width: min(92vw, 760px);
}
.crop-stage {
  position: relative;
  width: 100%;
  height: 56vh;
  background: #000;
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.crop-controls {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin: 12px 0;
}
.crop-controls label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  color: var(--muted);
}
.crop-controls input[type='range'] {
  width: 130px;
  accent-color: var(--accent);
}
.crop-save {
  display: flex;
  gap: 18px;
  margin-bottom: 8px;
}
```

- [ ] **Step 4:** `npx tsc --noEmit` → 0. **Commit:** `feat: PhotoEditorModal (react-easy-crop) + canvas crop helper`.

---

### Task 4: wire Edit into the grid + apply results in the editor

**Files:**
- Modify: `src/renderer/PhotoGrid.tsx`, `src/renderer/MachineEditor.tsx`

**Interfaces:**
- Consumes: `<PhotoEditorModal>` + `EditResult` (Task 3); existing `setRole`, `onChange`, `saveMachine`.

- [ ] **Step 1: PhotoGrid — add an Edit button + thumbnail cache-bust.** Add two props and use them:

In the `PhotoGrid` props, add `onEdit: (file: string) => void;` and `refreshKey: number;`. Change `thumbUrl` to take the key:

```ts
function thumbUrl(absPath: string, file: string, key: number) {
  return `figimg://f/${encodeURIComponent(`${absPath}/${file}`)}?k=${key}`;
}
```

Use `thumbUrl(absPath, p.file, refreshKey)` in the `<img src>`, and add an Edit button inside each `.photo-card` (after the caption input):

```tsx
          <button className="btn btn-secondary btn-sm" onClick={() => onEdit(p.file)}>
            Edit…
          </button>
```

- [ ] **Step 2: MachineEditor — own the modal, refresh key, and result handling.** Add imports + state:

```tsx
import { PhotoEditorModal, type EditResult } from './PhotoEditorModal';
// inside the component:
const [editing, setEditing] = useState<string | null>(null);
const [refreshKey, setRefreshKey] = useState(0);

async function onEdited(r: EditResult) {
  if (r.mode === 'new' && r.newFile) {
    const next = doc.photos
      .map((p) => (p.file === r.originalFile ? { ...p, role: 'skip' as const } : p))
      .concat({ file: r.newFile, role: 'gallery' as const });
    const nextDoc = { ...doc, photos: next };
    setDoc(nextDoc);
    await window.figureshift.saveMachine(machine.absPath, nextDoc);
    onSaved(nextDoc);
  } else {
    setRefreshKey((k) => k + 1); // overwrite: re-fetch the thumbnail
  }
  setEditing(null);
}
```

Pass the new props to `<PhotoGrid>` and render the modal:

```tsx
        <PhotoGrid
          absPath={machine.absPath}
          photos={doc.photos}
          onChange={(photos) => setDoc((d) => ({ ...d, photos }))}
          onEdit={(file) => setEditing(file)}
          refreshKey={refreshKey}
        />
```

```tsx
        {editing && (
          <PhotoEditorModal
            dir={machine.absPath}
            file={editing}
            onClose={() => setEditing(null)}
            onEdited={onEdited}
          />
        )}
```

(Place the modal render anywhere inside the returned JSX — it's a fixed overlay.)

- [ ] **Step 3:** `npx tsc --noEmit` → 0 and `npm test` → green. **Commit:** `feat: edit photos from the grid (modal + save-as-new/overwrite wiring)`.

---

### Task 5: Live verification (the user)

- [ ] `npm start`, open a machine, click **Edit…** on a photo. Crop + rotate/straighten + zoom. With **Save as new (copy)** (default): expect a new `«name»-edited.jpg` to appear as a `gallery` photo, the original flipped to `skip`, and `machine.yaml` updated. Switch to **Overwrite** on another: the original is replaced and its thumbnail updates in place. Confirm the cropped result matches what was framed (WYSIWYG). For an already-pushed machine, a save-as-new + **Update on TWDB** should delete the skipped original and add the edited one.

---

## After All Tasks

`npm test` green → `superpowers:finishing-a-development-branch`. Update `figureshift-resume`: photo editor done; overwrite-resync-on-push still deferred (hash-diff → updatePhoto image). 

## Self-Review

- **Spec coverage:** modal + crop/rotate/straighten/zoom (Task 3); fetch→blob load (Task 3); canvas export → bytes → path-guarded `photo:saveEdit` (Tasks 2–3); save-as-new writes uniquified `-edited` name (Task 1+2), adds gallery photo + skips original + persists yaml (Task 4); overwrite replaces + cache-bust (Tasks 2,4); push integration unchanged (save-as-new rides reconcile); overwrite-resync deferred (documented).
- **Types:** `saveEdit({dir,file,mode,bytes})`, `EditResult`, `cropImage(src,area,rotation)`, `editedFilename(original,existing)` consistent across tasks and `figureshift.d.ts`.
- **Renderer safety:** modal/grid import only React + `react-easy-crop` + local helpers; no `node:*`/twdb-client main index.
