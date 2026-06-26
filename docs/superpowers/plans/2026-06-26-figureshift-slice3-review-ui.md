# FigureShift Slice 3 — Review UI (master–detail) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A master–detail review screen: a machine list (with status + "X of Y on TWDB"), and a per-machine editor with brand/model/year resolution and a photo-role grid, saving back to `machine.yaml`.

**Architecture:** All in FigureShift. Main process gains IPC for brand/model lists + machine save, and a sandboxed `figimg://` protocol that serves image files confined to the scanned library root (for thumbnails). The renderer becomes a master–detail React UI; it imports **only** twdb-client's browser-safe `/validate` subpath (the main index pulls in `sharp`/Node and must not load in the renderer). One pure, unit-tested helper (`setRole`) handles exclusive photo roles. Saving writes `machine.yaml` via the existing `machineYaml` module.

**Tech Stack:** Electron (`protocol.handle`, `net.fetch`), React 19, TypeScript, Vitest, `@joelberger/twdb-client@0.4.0` (`/validate` subpath in renderer). Build/test on default Node; packaging (not needed here) still needs Node 24.15.0.

**Execution notes:**
- Work on a branch: `git checkout -b feat/slice3-review-ui` (don't commit to `main`).
- Slice 3 is UI-heavy: only `setRole` is unit-testable; everything else is verified by running the app (the user drives those checks). Push is **slice 4** — do not add any push/upload here.
- Remove the slice-1 sharp smoke-test button from the UI (it was packaging-spike scaffolding; the module/tests stay).

## File Structure

- `src/main/photoRoles.ts` (+ `.test.ts`) — pure `setRole` (exclusive cover/typeSample). **Create.**
- `src/main.ts` — add `twdb:brands`, `twdb:models`, `machine:save` IPC; register + handle `figimg://`; track scanned root. **Modify.**
- `src/preload.ts` — expose `brands`, `models`, `saveMachine`. **Modify.**
- `src/figureshift.d.ts` — central `window.figureshift` typing. **Create.**
- `src/renderer/MachineList.tsx` — master list + progress header. **Create.**
- `src/renderer/MachineEditor.tsx` — metadata + brand/model/year resolution. **Create.**
- `src/renderer/PhotoGrid.tsx` — thumbnails + role + caption. **Create.**
- `src/renderer/ReviewScreen.tsx` — master–detail composition + save. **Create.**
- `src/App.tsx` — login → pick root → ReviewScreen; drop smoke-test button + inline list. **Modify.**

---

### Task 1: Pure photo-role helper (exclusive cover/typeSample)

**Files:**
- Create: `src/main/photoRoles.ts`
- Test: `src/main/photoRoles.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { setRole } from './photoRoles';
import type { MachinePhoto } from './machineYaml';

const base: MachinePhoto[] = [
  { file: 'a.jpg', role: 'cover' },
  { file: 'b.jpg', role: 'gallery' },
  { file: 'c.jpg', role: 'typeSample' },
];

describe('setRole', () => {
  it('assigning cover to another photo demotes the previous cover to gallery', () => {
    const out = setRole(base, 'b.jpg', 'cover');
    expect(out.find((p) => p.file === 'a.jpg')!.role).toBe('gallery');
    expect(out.find((p) => p.file === 'b.jpg')!.role).toBe('cover');
  });
  it('typeSample is also exclusive', () => {
    const out = setRole(base, 'b.jpg', 'typeSample');
    expect(out.find((p) => p.file === 'c.jpg')!.role).toBe('gallery');
    expect(out.find((p) => p.file === 'b.jpg')!.role).toBe('typeSample');
  });
  it('gallery and skip are not exclusive (no demotions)', () => {
    const out = setRole(base, 'b.jpg', 'skip');
    expect(out.find((p) => p.file === 'a.jpg')!.role).toBe('cover');
    expect(out.find((p) => p.file === 'c.jpg')!.role).toBe('typeSample');
    expect(out.find((p) => p.file === 'b.jpg')!.role).toBe('skip');
  });
  it('does not mutate the input array', () => {
    const copy = structuredClone(base);
    setRole(base, 'b.jpg', 'cover');
    expect(base).toEqual(copy);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/main/photoRoles.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `src/main/photoRoles.ts`**

```ts
import type { MachinePhoto, PhotoRole } from './machineYaml';

const EXCLUSIVE: PhotoRole[] = ['cover', 'typeSample'];

// Set `file`'s role. cover and typeSample are exclusive: assigning one to a photo demotes
// whichever other photo currently holds that role back to 'gallery'. Returns a new array.
export function setRole(photos: MachinePhoto[], file: string, role: PhotoRole): MachinePhoto[] {
  return photos.map((p) => {
    if (p.file === file) return { ...p, role };
    if (EXCLUSIVE.includes(role) && p.role === role) return { ...p, role: 'gallery' };
    return p;
  });
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `npx vitest run src/main/photoRoles.test.ts` → PASS (4).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: pure setRole helper (exclusive cover/typeSample)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Main-process IPC + `figimg://` thumbnail protocol + preload

**Files:**
- Modify: `src/main.ts`, `src/preload.ts`
- Create: `src/figureshift.d.ts`

- [ ] **Step 1: Register the `figimg` scheme (before app ready) in `src/main.ts`**

Add near the top imports and after them (the `registerSchemesAsPrivileged` call must run before `app` is ready, i.e. at module top level):

```ts
import { app, BrowserWindow, dialog, ipcMain, protocol, net } from 'electron';
import { pathToFileURL } from 'node:url';
import { writeMachineYaml, type MachineDoc } from './main/machineYaml';

protocol.registerSchemesAsPrivileged([
  { scheme: 'figimg', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// The root of the most recent scan; figimg only serves files inside it.
let scannedRoot: string | null = null;
```

- [ ] **Step 2: Track the scanned root and add brand/model/save IPC**

In the existing `library:scan` handler, set `scannedRoot = path.resolve(root)` before scanning. Then add:

```ts
ipcMain.handle('twdb:brands', async () => (client ? (await getBrands(client)).map((b) => b.name) : []));

ipcMain.handle('twdb:models', async (_event, make: string) => {
  if (!client) return [];
  const brand = (await getBrands(client)).find((b) => b.name === make);
  return brand ? getCreateModels(client, brand.id) : [];
});

ipcMain.handle('machine:save', async (_event, absPath: string, doc: MachineDoc) => {
  writeMachineYaml(absPath, doc);
  return { ok: true };
});
```

- [ ] **Step 3: Serve thumbnails inside `app.whenReady().then(...)` (where `createWindow()` is called)**

```ts
protocol.handle('figimg', (request) => {
  const abs = path.resolve(decodeURIComponent(new URL(request.url).pathname.replace(/^\//, '')));
  const ok = scannedRoot && (abs === scannedRoot || abs.startsWith(scannedRoot + path.sep));
  if (!ok) return new Response('forbidden', { status: 403 });
  return net.fetch(pathToFileURL(abs).toString());
});
```

(The template registers windows via `app.on('ready', createWindow)`. If so, wrap the protocol handler registration alongside it — it must run after the app is ready.)

- [ ] **Step 4: Expose the new API in `src/preload.ts`**

Add to the `exposeInMainWorld('figureshift', { ... })` object:

```ts
  brands: () => ipcRenderer.invoke('twdb:brands'),
  models: (make: string) => ipcRenderer.invoke('twdb:models', make),
  saveMachine: (absPath: string, doc: unknown) => ipcRenderer.invoke('machine:save', absPath, doc),
```

- [ ] **Step 5: Centralize the renderer API type in `src/figureshift.d.ts`**

```ts
import type { ScannedMachine } from './main/scan';
import type { MachineDoc } from './main/machineYaml';

declare global {
  interface Window {
    figureshift: {
      login: (username: string, password: string) => Promise<{ ok: boolean; message?: string }>;
      resizeSmokeTest: () => Promise<{ ok: boolean; bytes: number; contentType: string; message?: string }>;
      pickRoot: () => Promise<string | null>;
      scan: (root: string) => Promise<ScannedMachine[]>;
      brands: () => Promise<string[]>;
      models: (make: string) => Promise<string[]>;
      saveMachine: (absPath: string, doc: MachineDoc) => Promise<{ ok: boolean }>;
    };
  }
}
export {};
```

(Type-only imports from `./main/*` are erased at build — safe in the renderer.)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit` → exit 0.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: brand/model/save IPC + figimg thumbnail protocol

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: MachineList (master) component

**Files:**
- Create: `src/renderer/MachineList.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { ScannedMachine } from '../main/scan';

export function MachineList({
  machines,
  selected,
  onSelect,
}: {
  machines: ScannedMachine[];
  selected: number;
  onSelect: (i: number) => void;
}) {
  const onTwdb = machines.filter((m) => m.status === 'onTwdb').length;
  return (
    <nav style={{ borderRight: '1px solid #ccc', overflowY: 'auto', minWidth: 220 }}>
      <p style={{ padding: '8px 12px', margin: 0, fontWeight: 600 }}>
        {onTwdb} of {machines.length} on TWDB
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {machines.map((m, i) => (
          <li key={m.relPath}>
            <button
              onClick={() => onSelect(i)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 12px',
                border: 'none',
                background: i === selected ? '#e6f0ff' : 'transparent',
                cursor: 'pointer',
              }}
            >
              {m.machine.make ?? '?'} {m.machine.model ?? ''}{' '}
              <span style={{ color: '#888' }}>{m.status === 'onTwdb' ? '✓' : ''}</span>
              <br />
              <small style={{ color: '#888' }}>{m.relPath}</small>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 2: Typecheck** (`npx tsc --noEmit` → 0). No commit yet (committed with Task 6 after the screen is wired), or commit standalone — your call. Recommended: commit at Task 6.

---

### Task 4: MachineEditor (metadata + brand/model/year resolution)

**Files:**
- Create: `src/renderer/MachineEditor.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useEffect, useState } from 'react';
import { isValidTwdbYear } from '@joelberger/twdb-client/validate';
import type { MachineDoc } from '../main/machineYaml';
import type { ScannedMachine } from '../main/scan';
import { PhotoGrid } from './PhotoGrid';

export function MachineEditor({
  machine,
  brands,
  onSaved,
}: {
  machine: ScannedMachine;
  brands: string[];
  onSaved: (doc: MachineDoc) => void;
}) {
  const [doc, setDoc] = useState<MachineDoc>(machine.machine);
  const [models, setModels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Reset the form when a different machine is selected.
  useEffect(() => setDoc(machine.machine), [machine.relPath]);

  // Fetch the selected make's models for the datalist (type-or-pick).
  useEffect(() => {
    const make = doc.make ?? '';
    if (!make) return setModels([]);
    let live = true;
    window.figureshift.models(make).then((m) => live && setModels(m));
    return () => {
      live = false;
    };
  }, [doc.make]);

  const set = (k: keyof MachineDoc, v: string) => setDoc((d) => ({ ...d, [k]: v }));
  const yearOk = !doc.year || isValidTwdbYear(doc.year);

  async function save() {
    setSaving(true);
    await window.figureshift.saveMachine(machine.absPath, doc);
    setSaving(false);
    onSaved(doc);
  }

  return (
    <section style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
      <h2>{doc.make ?? '?'} {doc.model ?? ''}</h2>

      <label style={{ display: 'block', marginBottom: 8 }}>
        Make
        <select value={doc.make ?? ''} onChange={(e) => set('make', e.target.value)} style={{ width: '100%' }}>
          <option value="">— choose brand —</option>
          {brands.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </label>

      <label style={{ display: 'block', marginBottom: 8 }}>
        Model
        <input
          list="fs-models"
          value={doc.model ?? ''}
          onChange={(e) => set('model', e.target.value)}
          style={{ width: '100%' }}
        />
        <datalist id="fs-models">
          {models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </label>

      <label style={{ display: 'block', marginBottom: 8 }}>
        Year
        <input
          value={doc.year ?? ''}
          onChange={(e) => set('year', e.target.value)}
          style={{ width: 120, borderColor: yearOk ? undefined : 'red' }}
        />
        {!yearOk && <span style={{ color: 'red' }}> use NNNN or e.g. 192X</span>}
      </label>

      <label style={{ display: 'block', marginBottom: 8 }}>
        Serial
        <input value={doc.serialNo ?? ''} onChange={(e) => set('serialNo', e.target.value)} style={{ width: '100%' }} />
      </label>

      <label style={{ display: 'block', marginBottom: 8 }}>
        Description
        <textarea
          value={doc.description ?? ''}
          onChange={(e) => set('description', e.target.value)}
          rows={3}
          style={{ width: '100%' }}
        />
      </label>

      <PhotoGrid
        absPath={machine.absPath}
        photos={doc.photos}
        onChange={(photos) => setDoc((d) => ({ ...d, photos }))}
      />

      <button onClick={save} disabled={saving || !yearOk} style={{ marginTop: 12 }}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck** (after Task 5 exists, since this imports `PhotoGrid`). Defer the tsc run to Task 5.

---

### Task 5: PhotoGrid (thumbnails + role + caption)

**Files:**
- Create: `src/renderer/PhotoGrid.tsx`

- [ ] **Step 1: Implement**

```tsx
import { setRole } from '../main/photoRoles';
import type { MachinePhoto, PhotoRole } from '../main/machineYaml';

const ROLES: PhotoRole[] = ['cover', 'typeSample', 'gallery', 'skip'];

function thumbUrl(absPath: string, file: string) {
  return `figimg://f/${encodeURIComponent(`${absPath}/${file}`)}`;
}

export function PhotoGrid({
  absPath,
  photos,
  onChange,
}: {
  absPath: string;
  photos: MachinePhoto[];
  onChange: (photos: MachinePhoto[]) => void;
}) {
  const setCaption = (file: string, caption: string) =>
    onChange(photos.map((p) => (p.file === file ? { ...p, caption } : p)));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
      {photos.map((p) => (
        <div key={p.file} style={{ border: '1px solid #ddd', padding: 6 }}>
          <img
            src={thumbUrl(absPath, p.file)}
            alt={p.file}
            style={{ width: '100%', height: 100, objectFit: 'cover', opacity: p.role === 'skip' ? 0.4 : 1 }}
          />
          <select
            value={p.role}
            onChange={(e) => onChange(setRole(photos, p.file, e.target.value as PhotoRole))}
            style={{ width: '100%' }}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <input
            placeholder="caption"
            value={p.caption ?? ''}
            onChange={(e) => setCaption(p.file, e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` → exit 0 (now MachineEditor + PhotoGrid both resolve).

---

### Task 6: ReviewScreen + App wiring + manual verification

**Files:**
- Create: `src/renderer/ReviewScreen.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: ReviewScreen**

```tsx
import { useEffect, useState } from 'react';
import type { ScannedMachine } from '../main/scan';
import type { MachineDoc } from '../main/machineYaml';
import { MachineList } from './MachineList';
import { MachineEditor } from './MachineEditor';

export function ReviewScreen({ machines: initial }: { machines: ScannedMachine[] }) {
  const [machines, setMachines] = useState(initial);
  const [selected, setSelected] = useState(0);
  const [brands, setBrands] = useState<string[]>([]);

  useEffect(() => {
    window.figureshift.brands().then(setBrands);
  }, []);

  const current = machines[selected];

  function onSaved(doc: MachineDoc) {
    setMachines((ms) => ms.map((m, i) => (i === selected ? { ...m, machine: doc } : m)));
  }

  if (machines.length === 0) return <p style={{ padding: 16 }}>No machines found.</p>;

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <MachineList machines={machines} selected={selected} onSelect={setSelected} />
      <MachineEditor key={current.relPath} machine={current} brands={brands} onSaved={onSaved} />
    </div>
  );
}
```

- [ ] **Step 2: Rework `src/App.tsx`** — keep login + folder pick; after a scan, render `ReviewScreen`. Remove the sharp smoke-test button and the old inline machine list. Result:

```tsx
import { useState, type FormEvent } from 'react';
import type { ScannedMachine } from './main/scan';
import { ReviewScreen } from './renderer/ReviewScreen';

export function App() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [machines, setMachines] = useState<ScannedMachine[] | null>(null);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setStatus('Logging in…');
    const res = await window.figureshift.login(username, password);
    setStatus(res.ok ? '' : (res.message ?? 'Login failed'));
  }

  async function onPick() {
    const picked = await window.figureshift.pickRoot();
    if (picked) setMachines(await window.figureshift.scan(picked));
  }

  if (machines) return <ReviewScreen machines={machines} />;

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 360 }}>
      <h1>FigureShift</h1>
      <form onSubmit={onLogin} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input placeholder="TWDB username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit">Log in</button>
      </form>
      <p>{status}</p>
      <hr />
      <button onClick={onPick}>Pick library folder…</button>
    </main>
  );
}
```

(The `window.figureshift` interface now lives in `src/figureshift.d.ts`; the inline `declare global` block in the old App.tsx is removed.)

- [ ] **Step 3: Typecheck + tests**

Run: `npx tsc --noEmit` (exit 0) and `npm test` (all suites pass, incl. the new `photoRoles` test).

- [ ] **Step 4: Manual verification (needs the user)**

Run `npm start`. Log in → pick a library folder. Expect: a left machine list with "X of Y on TWDB", clicking a machine shows the editor with make (brand dropdown), model (type-or-pick), year (red when malformed), serial, description, and a photo grid with **thumbnails**. Changing role to cover/typeSample moves it off any previous holder. Edit a field + **Save** → re-open the app (or re-pick) and confirm `machine.yaml` persisted the change.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: master–detail review UI (list + editor + photo grid)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## After All Tasks

Run `npm test` (green) and use `superpowers:finishing-a-development-branch` for the FigureShift branch. Update `figureshift-resume` memory: slice 3 done, next = slice 4 (push + state, mirroring DT's `twdbPush`). Keep the backlog items (container-folder detection, model-threshold tuning, hardening fuses).

## Self-Review Notes

- **Spec coverage:** machine list w/ status + "X of Y on TWDB" (Task 3); per-machine metadata + brand/model/year resolution with pickers/suggestions (Task 4, exact-match-or-prompt via the brand `<select>` + model datalist + year validity); photo-role grid + captions (Task 5); saving writes `machine.yaml` (Tasks 2/4/6). Push is deliberately out of scope (slice 4).
- **Types consistent:** `ScannedMachine`, `MachineDoc`, `MachinePhoto`, `PhotoRole` imported (type-only) from the main modules across renderer components; `setRole` signature matches PhotoGrid's usage.
- **Renderer safety:** the renderer imports only `@joelberger/twdb-client/validate` (browser-safe). No main-index (sharp/Node) import in renderer code.
- **No placeholders:** all component + IPC + protocol code is inline; `setRole` is TDD'd.
- **Security:** `figimg://` only serves files resolved inside the scanned root.
