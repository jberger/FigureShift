# FigureShift Progress & Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Visible progress for scan + push and in-UI error surfacing, as one status surface.

**Architecture:** Pure `pushProgressLabel` + `PushProgress` type; `pushMachine` emits progress; `machine:push` forwards over a `push:progress` event channel; renderer shows a determinate push bar, a scan spinner, and red errors.

**Tech Stack:** Electron IPC events, React, TypeScript, Vitest.

## Global Constraints

- Renderer imports only browser-safe modules; `pushProgress.ts` stays node-free so both sides import it.
- Extensionless relative imports.

---

### Task 1: pure `pushProgress` (type + label)

**Files:** Create `src/main/pushProgress.ts`; Test `src/main/pushProgress.test.ts`. Branch: `feat/progress-status`.

**Interfaces:** Produces `type PushProgress` and `pushProgressLabel(p: PushProgress): string`.

- [ ] **Step 1: failing test** `src/main/pushProgress.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { pushProgressLabel } from './pushProgress';

describe('pushProgressLabel', () => {
  it('labels each phase', () => {
    expect(pushProgressLabel({ phase: 'metadata' })).toBe('Saving gallery details…');
    expect(pushProgressLabel({ phase: 'upload', current: 3, total: 8 })).toBe('Uploading photo 3 of 8…');
    expect(pushProgressLabel({ phase: 'captions' })).toBe('Updating captions…');
    expect(pushProgressLabel({ phase: 'deletes' })).toBe('Removing photos…');
    expect(pushProgressLabel({ phase: 'finalize' })).toBe('Finishing…');
  });
  it('upload without counts falls back gracefully', () => {
    expect(pushProgressLabel({ phase: 'upload' })).toBe('Uploading photos…');
  });
});
```

- [ ] **Step 2:** Run → FAIL (module missing).

- [ ] **Step 3:** Implement `src/main/pushProgress.ts`

```ts
export type PushPhase = 'metadata' | 'upload' | 'captions' | 'deletes' | 'finalize';

export interface PushProgress {
  phase: PushPhase;
  current?: number;
  total?: number;
}

export function pushProgressLabel(p: PushProgress): string {
  switch (p.phase) {
    case 'metadata':
      return 'Saving gallery details…';
    case 'upload':
      return p.current && p.total ? `Uploading photo ${p.current} of ${p.total}…` : 'Uploading photos…';
    case 'captions':
      return 'Updating captions…';
    case 'deletes':
      return 'Removing photos…';
    case 'finalize':
      return 'Finishing…';
  }
}
```

- [ ] **Step 4:** Run → PASS (2). `npm test` green, `tsc --noEmit` 0.
- [ ] **Step 5:** Commit `feat: pure pushProgress type + label` (+ Co-Authored-By trailer).

---

### Task 2: emit progress from `pushMachine`

**Files:** Modify `src/main/push.ts`.

**Interfaces:** Consumes `PushProgress` (Task 1). Produces `pushMachine(client, absPath, onProgress?: (p: PushProgress) => void)`.

- [ ] **Step 1:** Import `import { type PushProgress } from './pushProgress';` and add the optional param:

```ts
export async function pushMachine(
  client: TwdbClient,
  absPath: string,
  onProgress: (p: PushProgress) => void = () => {},
): Promise<PushResult> {
```

- [ ] **Step 2:** Emit at each phase. After the create/update metadata block (right before `const photos = ...`):

```ts
  onProgress({ phase: 'metadata' });
```

In the adds loop, report per photo:

```ts
  for (let i = 0; i < adds.length; i++) {
    const p = adds[i];
    onProgress({ phase: 'upload', current: i + 1, total: adds.length });
    const caption = p.caption ?? '';
    const id = await safeAddPhoto(client, galleryId, abs(p), caption);
    if (id) uploaded.push({ file: p.file, photoId: id, caption });
  }
```

Before the caption-updates loop: `if (captionUpdates.length) onProgress({ phase: 'captions' });`
Before the deletes loop: `if (deletes.length) onProgress({ phase: 'deletes' });`
Before the `listMachinePhotos`/links/write finalization: `onProgress({ phase: 'finalize' });`

(Replace the existing `for (const p of adds)` loop with the indexed loop above. Keep everything else.)

- [ ] **Step 3:** `tsc --noEmit` 0, `npm test` green. Commit `feat: pushMachine emits progress events`.

---

### Task 3: wire the `push:progress` channel (main + preload + types)

**Files:** Modify `src/main.ts`, `src/preload.ts`, `src/figureshift.d.ts`.

- [ ] **Step 1:** In `src/main.ts`, the `machine:push` handler forwards progress to the calling renderer:

```ts
ipcMain.handle('machine:push', async (event, absPath: string) => {
  if (!client) return { ok: false as const, message: 'Not logged in.' };
  try {
    const res = await pushMachine(client, absPath, (p) => event.sender.send('push:progress', p));
    return { ok: true as const, ...res };
  } catch (err) {
    return { ok: false as const, message: err instanceof Error ? err.message : String(err) };
  }
});
```

- [ ] **Step 2:** In `src/preload.ts`, expose a subscription returning an unsubscribe:

```ts
  onPushProgress: (cb: (p: { phase: string; current?: number; total?: number }) => void) => {
    const h = (_e: unknown, p: { phase: string; current?: number; total?: number }) => cb(p);
    ipcRenderer.on('push:progress', h);
    return () => ipcRenderer.removeListener('push:progress', h);
  },
```

- [ ] **Step 3:** In `src/figureshift.d.ts`, import the type and add to the interface:

```ts
import type { PushProgress } from './main/pushProgress';
// ...inside figureshift:
      onPushProgress: (cb: (p: PushProgress) => void) => () => void;
```

- [ ] **Step 4:** `tsc --noEmit` 0. Commit `feat: push:progress IPC channel`.

---

### Task 4: scan spinner + push progress bar + errors in the UI

**Files:** Modify `src/App.tsx`, `src/renderer/MachineEditor.tsx`, `src/renderer/ReviewScreen.tsx`, `src/index.css`.

- [ ] **Step 1: `src/index.css`** — add a progress bar + success status:

```css
.progress-bar {
  height: 6px;
  background: var(--surface-2);
  border-radius: 999px;
  overflow: hidden;
  margin: 6px 0;
  max-width: 320px;
}
.progress-bar > span {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 0.2s ease;
}
.status.ok {
  color: var(--success);
}
```

- [ ] **Step 2: `src/App.tsx`** — scan spinner + error. Add a `scanning`/`scanErr` state and guard `onPick`:

```tsx
  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr] = useState('');

  async function onPick() {
    const picked = await window.figureshift.pickRoot();
    if (!picked) return;
    setScanning(true);
    setScanErr('');
    try {
      setMachines(await window.figureshift.scan(picked));
    } catch (e) {
      setScanErr(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  }
```

In the `phase === 'ready'` view, under the buttons add:

```tsx
        {scanning && <p className="status">Scanning your library…</p>}
        {scanErr && <p className="status error">Scan failed: {scanErr}</p>}
```

- [ ] **Step 3: `src/renderer/MachineEditor.tsx`** — show live progress during push. Import the label + add state:

```tsx
import { pushProgressLabel, type PushProgress } from '../main/pushProgress';
// state:
const [progress, setProgress] = useState<PushProgress | null>(null);
```

Rewrite `push()` to subscribe while pushing:

```tsx
  async function push() {
    setPushMsg('Saving…');
    await window.figureshift.saveMachine(machine.absPath, doc);
    onSaved(doc);
    setProgress({ phase: 'metadata' });
    setPushMsg('');
    const unsub = window.figureshift.onPushProgress((p) => setProgress(p));
    const res = await window.figureshift.push(machine.absPath);
    unsub();
    setProgress(null);
    if (res.ok) {
      setPushMsg(
        `${res.created ? 'Created' : 'Updated'} on TWDB — ${res.photosUploaded ?? 0} uploaded` +
          `, ${res.updated ?? 0} caption(s) updated, ${res.deleted ?? 0} deleted.`,
      );
      setPushedUrl(res.url ?? '');
      onPushed();
    } else {
      setPushMsg(`Push failed: ${res.message ?? 'unknown error'}`);
    }
  }
```

Disable the Push button while `progress` is non-null, and render the live status + bar (replace the existing `{pushMsg && ...}` line):

```tsx
        {progress ? (
          <>
            <p className="status">{pushProgressLabel(progress)}</p>
            {progress.phase === 'upload' && progress.total ? (
              <div className="progress-bar">
                <span style={{ width: `${Math.round(((progress.current ?? 0) / progress.total) * 100)}%` }} />
              </div>
            ) : null}
          </>
        ) : (
          pushMsg && <p className={`status${pushMsg.startsWith('Push failed') ? ' error' : ' ok'}`}>{pushMsg}</p>
        )}
```

(Change the push button's `disabled` to `gaps.length > 0 || saving || progress !== null`.)

- [ ] **Step 4: `src/renderer/ReviewScreen.tsx`** — failure tally in push-all:

```tsx
  async function pushAllReady() {
    const targets = machines.map((m, i) => ({ m, i })).filter(({ m }) => m.status === 'new');
    let done = 0;
    const failed: string[] = [];
    for (const { m, i } of targets) {
      setPushAll(`Pushing ${done + 1} of ${targets.length}: ${m.relPath}…`);
      const res = await window.figureshift.push(m.absPath);
      if (res.ok) markPushed(i);
      else failed.push(m.relPath);
      done++;
    }
    setPushAll(
      failed.length
        ? `Pushed ${done - failed.length} of ${done}; ${failed.length} failed: ${failed.join(', ')}`
        : `Done — pushed ${done} machine(s).`,
    );
  }
```

- [ ] **Step 5:** `tsc --noEmit` 0, `npm test` green. Commit `feat: scan spinner, push progress bar, push-all failure summary`.

---

### Task 5: Live verification (the user)

- [ ] `npm start`: pick a folder → "Scanning your library…" shows, then the review screen. Push a machine with several gallery photos → "Uploading photo N of M…" with a bar, then the green summary. Run **Push all ready** → "Pushing X of Y" and, if any fail, a red-ish "…N failed: …" summary. Force a failure (e.g., log out mid-flow or an offline push) → red error in the editor.

---

## After All Tasks

`npm test` green → `superpowers:finishing-a-development-branch`. Update `figureshift-resume`: progress + error surfacing done; remaining polish = onboarding; TODOs unchanged.

## Self-Review

- **Spec coverage:** scan spinner + error (Task 4); determinate push progress via `push:progress` events (Tasks 1–4) with bar; push-all failure summary (Task 4); errors in-UI red (Task 4). Out-of-scope items (scan counts, per-row badge) excluded.
- **Types:** `PushProgress`/`pushProgressLabel` consistent across main, preload, d.ts, renderer; `pushMachine` new optional param is backward-compatible.
