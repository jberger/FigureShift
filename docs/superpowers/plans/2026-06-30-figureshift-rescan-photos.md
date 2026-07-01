# FigureShift Rescan-For-New-Photos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users pick up photos added to a machine folder while FigureShift is open — automatically on tab switch (including the first tab at startup) and via a per-machine button — and flag photos whose file has disappeared from disk.

**Architecture:** A pure main-process engine (`reconcileMachineDir`) diffs the image files on disk against `machine.yaml`'s photo list and reports `{ added, missing }` without mutating anything. A new `machine:rescan` IPC channel exposes it. In the renderer, a single `rescan()` in `MachineEditor` runs on mount (so every tab, including the first shown at startup) and on a "Check for new photos" button; it merges `added` files into the in-memory doc (preserving unsaved role/caption edits), saves, and drives a notice. `PhotoGrid` renders a "File not found" badge + Remove action on `missing` cards and briefly highlights `added` ones.

**Tech Stack:** Electron (main + preload + renderer), React + TypeScript, Vitest, `@joelberger/twdb-client`, `yaml`.

## Global Constraints

- The reconcile engine MUST NOT write or mutate `machine.yaml` — it only reports. The renderer owns the merge + save, so unsaved edits are never clobbered.
- The rescan trigger is **on mount** (the first render at startup is a mount), not "on tab change." Do not guard the mount effect to skip its initial run.
- New photos are appended with `role: 'gallery'`.
- Match files by exact filename string (as returned by `readdir` / stored in yaml).
- Follow existing patterns: logic lives in `src/main/*` with Vitest temp-dir tests (`src/main/scan.test.ts` style); the renderer has no test harness, so renderer/CSS tasks are verified by `npx tsc --noEmit` + manual smoke.
- Run all tests with `npm test` (`vitest run`).

---

### Task 1: Reconcile engine (`reconcileMachineDir`)

**Files:**
- Create: `src/main/rescan.ts`
- Test: `src/main/rescan.test.ts`

**Interfaces:**
- Consumes: `isImageFile` from `./library`; `readMachineYaml` from `./machineYaml`.
- Produces: `reconcileMachineDir(absPath: string): { added: string[]; missing: string[] }` and `interface RescanResult { added: string[]; missing: string[] }`.

- [ ] **Step 1: Write the failing tests**

Create `src/main/rescan.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { reconcileMachineDir } from './rescan';

// A machine folder with the given image files and a machine.yaml listing `listed`.
function machineDir(files: string[], listed: string[]): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'fs-rescan-'));
  for (const f of files) writeFileSync(path.join(dir, f), 'x');
  const photos = listed.map((f) => `  - {file: ${f}, role: gallery}`).join('\n');
  writeFileSync(path.join(dir, 'machine.yaml'), `make: Royal\nphotos:\n${photos}\n`);
  return dir;
}

describe('reconcileMachineDir', () => {
  it('reports image files on disk that are absent from the yaml as added, sorted', () => {
    const dir = machineDir(['a.jpg', 'c.jpg', 'b.jpg'], ['a.jpg']);
    const { added } = reconcileMachineDir(dir);
    expect(added).toEqual(['b.jpg', 'c.jpg']);
  });

  it('reports yaml photos whose file is gone from disk as missing', () => {
    const dir = machineDir(['a.jpg'], ['a.jpg', 'gone.jpg']);
    const { missing } = reconcileMachineDir(dir);
    expect(missing).toEqual(['gone.jpg']);
  });

  it('does not re-add already-listed files, including -edited copies', () => {
    const dir = machineDir(['a.jpg', 'a-edited.jpg'], ['a.jpg', 'a-edited.jpg']);
    expect(reconcileMachineDir(dir).added).toEqual([]);
  });

  it('ignores non-image files on disk', () => {
    const dir = machineDir(['a.jpg', 'notes.txt', 'machine.yaml'], ['a.jpg']);
    expect(reconcileMachineDir(dir).added).toEqual([]);
  });

  it('leaves machine.yaml unchanged on disk (report-only)', () => {
    const dir = machineDir(['a.jpg', 'b.jpg'], ['a.jpg']);
    const before = readFileSync(path.join(dir, 'machine.yaml'), 'utf8');
    reconcileMachineDir(dir);
    expect(readFileSync(path.join(dir, 'machine.yaml'), 'utf8')).toBe(before);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- rescan`
Expected: FAIL — `Cannot find module './rescan'` / `reconcileMachineDir is not a function`.

- [ ] **Step 3: Write the implementation**

Create `src/main/rescan.ts`:

```ts
import { readdirSync } from 'node:fs';
import { isImageFile } from './library';
import { readMachineYaml } from './machineYaml';

export interface RescanResult {
  added: string[];   // image files on disk not yet in machine.yaml (sorted)
  missing: string[]; // machine.yaml photos whose file is gone from disk
}

// Report-only diff of a machine folder against its machine.yaml. Never writes:
// the renderer merges `added` into the in-memory doc and saves, so unsaved edits survive.
export function reconcileMachineDir(absPath: string): RescanResult {
  const onDisk = readdirSync(absPath, { withFileTypes: true })
    .filter((e) => e.isFile() && isImageFile(e.name))
    .map((e) => e.name);
  const diskSet = new Set(onDisk);
  const yamlFiles = readMachineYaml(absPath).photos.map((p) => p.file);
  const yamlSet = new Set(yamlFiles);
  const added = onDisk.filter((f) => !yamlSet.has(f)).sort();
  const missing = yamlFiles.filter((f) => !diskSet.has(f));
  return { added, missing };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- rescan`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/rescan.ts src/main/rescan.test.ts
git commit -m "feat: reconcileMachineDir — report-only disk↔yaml photo diff"
```

---

### Task 2: IPC wiring (`machine:rescan`)

**Files:**
- Modify: `src/main.ts` (import + new handler after the `machine:save` handler at `src/main.ts:113-116`)
- Modify: `src/preload.ts:29` (add `rescan` next to `saveMachine`)
- Modify: `src/figureshift.d.ts:26` (add `rescan` type next to `saveMachine`)

**Interfaces:**
- Consumes: `reconcileMachineDir` from `./main/rescan`; module-level `scannedRoot` and `path` already in `src/main.ts`.
- Produces: `window.figureshift.rescan(absPath: string): Promise<{ ok: boolean; added: string[]; missing: string[]; message?: string }>`.

- [ ] **Step 1: Add the main-process import**

In `src/main.ts`, add below the existing `import { scanLibrary } from './main/scan';` (line 9):

```ts
import { reconcileMachineDir } from './main/rescan';
```

- [ ] **Step 2: Add the IPC handler**

In `src/main.ts`, immediately after the `machine:save` handler (after `src/main.ts:116`), add — reusing the same library-confinement guard as `photo:read`:

```ts
ipcMain.handle('machine:rescan', (_event, absPath: string) => {
  const abs = path.resolve(absPath);
  const ok = scannedRoot && (abs === scannedRoot || abs.startsWith(scannedRoot + path.sep));
  if (!ok) return { ok: false as const, added: [], missing: [], message: 'Outside the library.' };
  try {
    const { added, missing } = reconcileMachineDir(abs);
    return { ok: true as const, added, missing };
  } catch (err) {
    return { ok: false as const, added: [], missing: [], message: err instanceof Error ? err.message : String(err) };
  }
});
```

- [ ] **Step 3: Expose it in preload**

In `src/preload.ts`, after the `saveMachine` line (line 29), add:

```ts
  rescan: (absPath: string) => ipcRenderer.invoke('machine:rescan', absPath),
```

- [ ] **Step 4: Add the type**

In `src/figureshift.d.ts`, after the `saveMachine` line (line 26), add:

```ts
      rescan: (
        absPath: string,
      ) => Promise<{ ok: boolean; added: string[]; missing: string[]; message?: string }>;
```

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/preload.ts src/figureshift.d.ts
git commit -m "feat: machine:rescan IPC channel for reconcileMachineDir"
```

---

### Task 3: Renderer rescan routine — mount trigger, button, notice (`MachineEditor`)

**Files:**
- Modify: `src/renderer/MachineEditor.tsx` (state near lines 33-40; new `rescan()` + mount effect; Photos header at lines 218-229)

**Interfaces:**
- Consumes: `window.figureshift.rescan`; existing `doc`/`setDoc`, `machine.absPath`, `machine.relPath`, `onSaved`, `saveMachine`; `MachinePhoto` from `../main/machineYaml`.
- Produces: `missingFiles: string[]` and `addedFiles: string[]` passed to `PhotoGrid` in Task 4; a `rescan()` bound to the button and the mount effect.

- [ ] **Step 1: Import `MachinePhoto`**

In `src/renderer/MachineEditor.tsx`, extend the existing import on line 4 so it reads:

```ts
import type { MachineDoc, MachineLink, MachinePhoto } from '../main/machineYaml';
```

- [ ] **Step 2: Add rescan state**

In `src/renderer/MachineEditor.tsx`, after the `const [refreshKey, setRefreshKey] = useState(0);` line (line 40), add:

```tsx
  const [missingFiles, setMissingFiles] = useState<string[]>([]);
  const [addedFiles, setAddedFiles] = useState<string[]>([]);
  const [rescanMsg, setRescanMsg] = useState('');
```

- [ ] **Step 3: Add the `rescan()` routine and mount trigger**

In `src/renderer/MachineEditor.tsx`, add just after the existing `onEdited` function (after line 65). `rescan` reads the current `doc` via closure, so the button always merges into the latest state:

```tsx
  // Pick up photos added to (or removed from) the folder since the doc was loaded.
  // Merges new files into the in-memory doc so unsaved role/caption edits survive.
  async function rescan() {
    const res = await window.figureshift.rescan(machine.absPath);
    if (!res.ok) return;
    setMissingFiles(res.missing);
    const missingNote = res.missing.length
      ? ` ${res.missing.length} photo${res.missing.length > 1 ? 's are' : ' is'} missing.`
      : '';
    if (res.added.length === 0) {
      setAddedFiles([]);
      setRescanMsg(missingNote.trim());
      return;
    }
    const newPhotos: MachinePhoto[] = res.added.map((file) => ({ file, role: 'gallery' as const }));
    const nextDoc = { ...doc, photos: [...doc.photos, ...newPhotos] };
    setDoc(nextDoc);
    await window.figureshift.saveMachine(machine.absPath, nextDoc);
    onSaved(nextDoc);
    setAddedFiles(res.added);
    setRescanMsg(`Added ${res.added.length} new photo${res.added.length > 1 ? 's' : ''}.${missingNote}`);
  }

  // Runs on every mount — that includes the first tab shown at startup, since the first
  // render is itself a mount. ReviewScreen keys MachineEditor by relPath, so switching tabs
  // remounts and re-runs this. Do NOT add a guard that skips the initial run.
  useEffect(() => {
    rescan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machine.relPath]);
```

- [ ] **Step 4: Reset the notice on tab switch**

In `src/renderer/MachineEditor.tsx`, inside the existing `[machine.relPath]` effect body (lines 43-46), add these resets so a stale notice/flag from the previous machine doesn't linger:

```tsx
    setRescanMsg('');
    setAddedFiles([]);
    setMissingFiles([]);
```

(Place them alongside the existing `setPushMsg('')` etc. This effect runs before the rescan effect, which then repopulates them for the new machine.)

- [ ] **Step 5: Add the button + notice to the Photos header**

In `src/renderer/MachineEditor.tsx`, replace the `<h3 className="photos-h">Photos</h3>` line (line 218) with:

```tsx
      <div className="photos-head">
        <h3 className="photos-h">Photos</h3>
        <button className="btn btn-secondary btn-sm" type="button" onClick={rescan}>
          Check for new photos
        </button>
      </div>
      {rescanMsg && <p className="note">{rescanMsg}</p>}
```

- [ ] **Step 6: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors. (`missingFiles`/`addedFiles` are declared but not yet consumed — that is wired in Task 4. If the project's lint fails the build on unused vars, run `npm start` instead to verify; otherwise `tsc --noEmit` tolerates unused local state.)

- [ ] **Step 7: Manual smoke**

Run: `npm start`. Open a library, select a machine, then in Finder/Explorer drop a new image into that machine's folder and click **Check for new photos** → a new gallery card appears and the notice reads "Added 1 new photo." Switch to another tab and back → no duplicate is added (it's now in the yaml).

- [ ] **Step 8: Commit**

```bash
git add src/renderer/MachineEditor.tsx
git commit -m "feat: rescan machine folder on mount and via Check-for-new-photos button"
```

---

### Task 4: Missing-file flag + Remove + new-photo highlight (`PhotoGrid` + CSS)

**Files:**
- Modify: `src/renderer/PhotoGrid.tsx` (props ~lines 50-62; `SortablePhoto` lines 35-48; `inner`/`plainCard` lines 113-167; gallery map line 202)
- Modify: `src/renderer/MachineEditor.tsx` (the `<PhotoGrid ... />` call at lines 223-229 — pass the new props)
- Modify: `src/index.css` (append new rules)

**Interfaces:**
- Consumes: `missingFiles`, `addedFiles` from Task 3; existing `onChange`, `photos`.
- Produces: no new exports; visual behavior only.

- [ ] **Step 1: Pass the new props from MachineEditor**

In `src/renderer/MachineEditor.tsx`, update the `<PhotoGrid />` call (lines 223-229) to add two props:

```tsx
      <PhotoGrid
        absPath={machine.absPath}
        photos={doc.photos}
        onChange={(photos) => setDoc((d) => ({ ...d, photos }))}
        onEdit={(file) => setEditing(file)}
        refreshKey={refreshKey}
        missing={missingFiles}
        added={addedFiles}
      />
```

- [ ] **Step 2: Extend PhotoGrid props**

In `src/renderer/PhotoGrid.tsx`, add to the props type (after `refreshKey: number;`, line 61):

```tsx
  missing: string[];
  added: string[];
```

and add them to the destructured params (after `refreshKey,`, line 61):

```tsx
  missing,
  added,
```

- [ ] **Step 3: Let `SortablePhoto` accept a className**

In `src/renderer/PhotoGrid.tsx`, change the `SortablePhoto` signature and its wrapper `div` (lines 35 and 44) so gallery cards can carry the flag/highlight classes:

```tsx
function SortablePhoto({
  id,
  className,
  children,
}: {
  id: string;
  className: string;
  children: (drag: Record<string, unknown>) => ReactNode;
}) {
```

and the returned wrapper div (line 44):

```tsx
    <div ref={setNodeRef} style={style} className={className}>
```

- [ ] **Step 4: Compute per-card classes and render the missing badge**

In `src/renderer/PhotoGrid.tsx`, after the `const skipped = ...` line (line 110), add sets and a class helper:

```tsx
  const missingSet = new Set(missing);
  const addedSet = new Set(added);
  const cardClass = (p: MachinePhoto) =>
    `photo-card${p.role === 'skip' ? ' is-skip' : ''}` +
    `${missingSet.has(p.file) ? ' is-missing' : ''}${addedSet.has(p.file) ? ' is-new' : ''}`;
```

Then, in `inner`, replace the `<div className="photo-thumb">…</div>` block (lines 119-124) with a branch that shows a "File not found" badge + Remove for missing files:

```tsx
      <div className="photo-thumb">
        {missingSet.has(p.file) ? (
          <div className="photo-missing" style={{ height: Math.round(eff * 0.72) }}>
            <span>File not found</span>
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              onClick={() => onChange(photos.filter((x) => x.file !== p.file))}
            >
              Remove
            </button>
          </div>
        ) : (
          <>
            <img
              src={thumbUrl(absPath, p.file, refreshKey)}
              alt={p.file}
              style={{ height: Math.round(eff * 0.72) }}
            />
            <button className="photo-edit-overlay" onClick={() => onEdit(p.file)} title="Edit photo">
              Edit
            </button>
          </>
        )}
      </div>
```

- [ ] **Step 5: Apply `cardClass` to plain and gallery cards**

In `src/renderer/PhotoGrid.tsx`, change `plainCard` (lines 163-167) to use the helper:

```tsx
  const plainCard = (p: MachinePhoto) => (
    <div key={p.file} className={cardClass(p)}>
      {inner(p)}
    </div>
  );
```

and pass the class into the gallery `SortablePhoto` (line 202):

```tsx
                  <SortablePhoto key={p.file} id={p.file} className={cardClass(p)}>
```

- [ ] **Step 6: Add the CSS**

Append to `src/index.css`:

```css
.photos-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.photo-card.is-missing {
  opacity: 0.8;
}
.photo-missing {
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 0.85rem;
  text-align: center;
}
@keyframes fs-new-photo {
  from {
    box-shadow: 0 0 0 3px var(--accent);
    background: var(--accent-soft);
  }
  to {
    box-shadow: 0 0 0 3px transparent;
    background: transparent;
  }
}
.photo-card.is-new {
  animation: fs-new-photo 2s ease-out;
}
```

- [ ] **Step 7: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Manual smoke**

Run: `npm start`. Open a machine, drop a new photo into its folder, click **Check for new photos** → the new card is briefly ring-highlighted. Then delete a listed photo's file in Finder/Explorer and click again → that card shows "File not found" with a **Remove** button; Remove drops it from the list and the card disappears.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/PhotoGrid.tsx src/renderer/MachineEditor.tsx src/index.css
git commit -m "feat: flag missing photos with Remove, highlight newly picked-up photos"
```

---

### Task 5: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS, including the 5 new `rescan` tests.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: End-to-end manual pass**

Run: `npm start` and confirm the spec's acceptance behaviors:
1. On a fresh session, the **first** machine tab shown already reflects any photos added to its folder while the app was closed (mount rescan fired for tab 0).
2. Switching to another tab picks up new photos in that folder.
3. The **Check for new photos** button works while sitting on a tab.
4. A photo whose file was deleted shows "File not found" + Remove.
5. Rescanning a folder with no changes adds nothing and shows no notice.

---

## Self-Review

**Spec coverage:**
- Reconcile engine (add/missing, report-only) → Task 1. ✓
- IPC exposure → Task 2. ✓
- Tab-switch auto-rescan incl. first tab at startup → Task 3 (mount effect, documented as base case). ✓
- Per-machine "Check for new photos" button → Task 3. ✓
- Brief notice + new cards visible/highlighted → Task 3 (notice) + Task 4 (highlight). ✓
- New photos appended as `gallery` → Task 3 Step 3. ✓
- Missing files flagged in UI + actionable Remove → Task 4. ✓
- Unsaved-edit safety (renderer merges, engine never writes) → Global Constraints + Task 1/Task 3. ✓
- Tests in scan.test.ts temp-dir style → Task 1. ✓
- Out of scope (new-folder discovery, drag-import, watcher) → not implemented, correct. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows complete code. ✓

**Type consistency:** `reconcileMachineDir` / `RescanResult` names match across Tasks 1–2; `rescan(absPath) → { ok, added, missing, message? }` identical in main handler, preload, and d.ts; `missing`/`added` prop names consistent between MachineEditor (Task 3/4 Step 1) and PhotoGrid (Task 4 Steps 2–5); `cardClass` used in both plain and gallery cards. ✓
