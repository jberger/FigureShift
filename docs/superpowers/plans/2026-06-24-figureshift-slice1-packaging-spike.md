# FigureShift Slice 1 — Electron Packaging/Signing Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a locally-signed, installable Electron app that logs into the Typewriter Database via `@joelberger/twdb-client` and proves `sharp` survives packaging — before any features are built.

**Architecture:** Electron Forge (Vite + TypeScript template) with a React renderer. `twdb-client` runs in the **main (Node) process**; the renderer talks to it over a narrow, typed IPC bridge exposed via `contextBridge` in a preload script. Two small main-process modules (`twdbAuth`, `resizeSmokeTest`) are pure/injectable so they're unit-testable without the network; the packaging itself is verified by building and running the packaged app.

**Tech Stack:** Electron Forge, `@electron-forge/plugin-vite`, `@electron-forge/plugin-auto-unpack-natives`, `@electron-forge/maker-dmg`, React 19, TypeScript, Vite, `@joelberger/twdb-client` (^0.2.6, ESM, brings `sharp` ^0.35), Vitest. Spike target platform: **macOS** (ad-hoc signed; notarization wired but gated behind env vars).

**Execution note:** The repo is currently on `main` with two commits. Do **not** implement on `main` — create a feature branch (`feat/slice1-packaging-spike`) or an isolated worktree (via `superpowers:using-git-worktrees`) before Task 1.

**Signing posture:** `osxSign` uses `identity: process.env.APPLE_IDENTITY || '-'` (ad-hoc by default). `osxNotarize` is only configured when `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID` are all present, so enabling real notarization later is purely additive.

---

## File Structure

The Electron Forge Vite+TS template generates the base; we add React and our modules.

- `package.json` — scripts (`start`, `package`, `make`, `test`), deps. **Modify.**
- `forge.config.ts` — Forge config: makers (zip + dmg), plugins (vite, auto-unpack-natives, fuses), `packagerConfig` with `osxSign`/`osxNotarize`. **Modify (generated).**
- `vite.main.config.ts` — externalize `sharp` so the native module isn't bundled. **Modify (generated).**
- `vite.preload.config.ts`, `vite.renderer.config.ts` — renderer gets the React plugin. **Modify (generated).**
- `index.html` — `<div id="root">` + renderer entry. **Modify (generated).**
- `src/main.ts` — window creation (generated) + IPC handler registration. **Modify.**
- `src/preload.ts` — `contextBridge` exposing `window.figureshift`. **Modify (generated).**
- `src/renderer.tsx` — React mount (renamed from `renderer.ts`). **Create/rename.**
- `src/App.tsx` — login form + sharp smoke-test button. **Create.**
- `src/main/twdbAuth.ts` — `attemptLogin()` wrapper around `twdb-client`. **Create.**
- `src/main/twdbAuth.test.ts` — Vitest. **Create.**
- `src/main/resizeSmokeTest.ts` — `resizeSmokeTest()` exercising `sharp` via `resizeForGallery`. **Create.**
- `src/main/resizeSmokeTest.test.ts` — Vitest. **Create.**
- `.env.example` — documents `APPLE_IDENTITY` / `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID`. **Create.**

---

### Task 1: Scaffold Electron Forge (Vite + TS) with React, booting in dev

**Files:**
- Create (generated): `package.json`, `forge.config.ts`, `vite.*.config.ts`, `index.html`, `src/main.ts`, `src/preload.ts`, `tsconfig.json`
- Create/rename: `src/renderer.tsx`, `src/App.tsx`

- [ ] **Step 1: Create the feature branch**

Run:
```bash
cd /Users/joelberger/Programs/Node/figureshift
git checkout -b feat/slice1-packaging-spike
```

- [ ] **Step 2: Scaffold the Forge Vite+TS template into a temp dir, then merge into the repo**

The scaffolder needs to create its own directory; merge its output in without disturbing `.git/` or `docs/`.

Run:
```bash
cd /Users/joelberger/Programs/Node
npx create-electron-app@latest figureshift-scaffold -- --template=vite-typescript
# Move generated files (incl. dotfiles) into the existing repo, then drop the temp dir:
rsync -a --exclude='.git' figureshift-scaffold/ figureshift/
rm -rf figureshift-scaffold
cd figureshift
```
Expected: `figureshift/` now contains `forge.config.ts`, `src/main.ts`, `src/preload.ts`, `src/renderer.ts`, `index.html`, `vite.*.config.ts`, and `package.json` alongside the pre-existing `docs/`.

- [ ] **Step 3: Install dependencies and React**

Run:
```bash
npm install
npm install react react-dom
npm install -D @vitejs/plugin-react @types/react @types/react-dom @electron-forge/plugin-auto-unpack-natives @electron-forge/maker-dmg
```
Expected: installs complete with no errors.

- [ ] **Step 4: Convert the renderer to React**

Delete `src/renderer.ts`. Create `src/renderer.tsx`:

```tsx
import { createRoot } from 'react-dom/client';
import { App } from './App';

const container = document.getElementById('root');
if (!container) throw new Error('Root container #root not found');
createRoot(container).render(<App />);
```

Create a placeholder `src/App.tsx` (replaced in Task 5):

```tsx
export function App() {
  return <h1>FigureShift</h1>;
}
```

Edit `index.html`: ensure a root node and the renderer entry point. The `<body>` should contain:

```html
<body>
    <div id="root"></div>
    <script type="module" src="/src/renderer.tsx"></script>
</body>
```

- [ ] **Step 5: Add the React plugin to the renderer Vite config**

Replace `vite.renderer.config.ts` with:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config
export default defineConfig({
  plugins: [react()],
});
```

- [ ] **Step 6: Point the Vite plugin's renderer entry at the new `.tsx` file**

In `forge.config.ts`, the `@electron-forge/plugin-vite` config has a `renderer` array entry. Ensure its `config` points at `vite.renderer.config.ts` (template default) — no change needed if it already does. Confirm the `build` entries reference `src/main.ts` and `src/preload.ts` (template defaults).

- [ ] **Step 7: Run the app in dev to verify it boots**

Run:
```bash
npm start
```
Expected: an Electron window opens showing the heading **FigureShift**. No errors in the terminal or DevTools console. Close the window to stop.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Electron Forge (Vite+TS) with React renderer"
```

---

### Task 2: Tested TWDB login wrapper in the main process

**Files:**
- Create: `src/main/twdbAuth.ts`
- Test: `src/main/twdbAuth.test.ts`
- Modify: `package.json` (add Vitest + `test` script)

- [ ] **Step 1: Add Vitest**

Run:
```bash
npm install -D vitest
```
Then add to `package.json` `"scripts"`:
```json
"test": "vitest run"
```

- [ ] **Step 2: Write the failing test**

Create `src/main/twdbAuth.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AuthError } from '@joelberger/twdb-client';
import { attemptLogin } from './twdbAuth';

const okClient = () => ({ login: async () => {} }) as never;
const authFailClient = () =>
  ({ login: async () => { throw new AuthError('bad creds'); } }) as never;

describe('attemptLogin', () => {
  it('returns ok on successful login', async () => {
    const res = await attemptLogin('user', 'pass', okClient);
    expect(res).toEqual({ ok: true });
  });

  it('maps AuthError to a friendly failure message', async () => {
    const res = await attemptLogin('user', 'bad', authFailClient);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/check your username/i);
  });

  it('rejects empty credentials without constructing a client', async () => {
    const res = await attemptLogin('', '', () => { throw new Error('should not construct'); });
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/main/twdbAuth.test.ts`
Expected: FAIL — `attemptLogin` not found (module `./twdbAuth` does not exist).

- [ ] **Step 4: Implement the wrapper**

Create `src/main/twdbAuth.ts`:

```ts
import { TwdbClient, AuthError } from '@joelberger/twdb-client';

export interface LoginResult {
  ok: boolean;
  message?: string;
}

/**
 * Attempt a TWDB login. `makeClient` is injectable so this is unit-testable
 * without hitting the network; production uses the default real client.
 */
export async function attemptLogin(
  username: string,
  password: string,
  makeClient: () => TwdbClient = () => new TwdbClient(),
): Promise<LoginResult> {
  if (!username || !password) {
    return { ok: false, message: 'Username and password are required.' };
  }
  try {
    await makeClient().login(username, password);
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthError) {
      return { ok: false, message: 'Login failed: check your username and password.' };
    }
    const message = err instanceof Error ? err.message : 'Unknown error during login.';
    return { ok: false, message: `Login error: ${message}` };
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/main/twdbAuth.test.ts`
Expected: PASS (3 passing).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add tested TWDB login wrapper (main process)"
```

---

### Task 3: Tested sharp resize smoke test

**Files:**
- Create: `src/main/resizeSmokeTest.ts`
- Test: `src/main/resizeSmokeTest.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/resizeSmokeTest.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resizeSmokeTest } from './resizeSmokeTest';

describe('resizeSmokeTest', () => {
  it('resizes the embedded sample via sharp and reports bytes', async () => {
    const res = await resizeSmokeTest();
    expect(res.ok).toBe(true);
    expect(res.bytes).toBeGreaterThan(0);
    expect(res.contentType).toBe('image/jpeg');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/main/resizeSmokeTest.test.ts`
Expected: FAIL — module `./resizeSmokeTest` does not exist.

- [ ] **Step 3: Implement the smoke test**

Create `src/main/resizeSmokeTest.ts`. The base64 constant below is a real 64×48 JPEG (285 bytes), decoded in-process so the test exercises sharp's native binary without bundling an external asset into the packaged asar:

```ts
import { resizeForGallery } from '@joelberger/twdb-client';

// A tiny 64x48 solid-color JPEG, embedded as base64. Decoding + re-encoding it
// through resizeForGallery exercises sharp's native binary end-to-end, which is
// exactly the packaging risk this spike de-risks.
const SAMPLE_JPEG_BASE64 =
  '/9j/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAwAEADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAL/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCLAWkAAAAAAAAAAAAAAAAAAAAAB//Z';

export interface SmokeTestResult {
  ok: boolean;
  bytes: number;
  contentType: string;
  message?: string;
}

export async function resizeSmokeTest(): Promise<SmokeTestResult> {
  try {
    const input = Buffer.from(SAMPLE_JPEG_BASE64, 'base64');
    const out = await resizeForGallery(input, 'smoke.jpg');
    return { ok: out.content.length > 0, bytes: out.content.length, contentType: out.contentType };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, bytes: 0, contentType: '', message };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/main/resizeSmokeTest.test.ts`
Expected: PASS (1 passing) — proves sharp loads and resizes in the Node test environment. (Packaged-app proof comes in Task 6.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add tested sharp resize smoke test"
```

---

### Task 4: Wire the IPC bridge (preload + main handlers)

**Files:**
- Modify: `src/preload.ts`, `src/main.ts`

- [ ] **Step 1: Expose a narrow API from the preload script**

Replace `src/preload.ts` with:

```ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('figureshift', {
  login: (username: string, password: string) =>
    ipcRenderer.invoke('twdb:login', { username, password }),
  resizeSmokeTest: () => ipcRenderer.invoke('twdb:resizeSmokeTest'),
});
```

- [ ] **Step 2: Register the handlers in main**

In `src/main.ts`, add these imports near the top:

```ts
import { ipcMain } from 'electron';
import { attemptLogin } from './main/twdbAuth';
import { resizeSmokeTest } from './main/resizeSmokeTest';
```

Inside the existing `app.whenReady().then(() => { ... })` block (before or after `createWindow()`), register:

```ts
ipcMain.handle('twdb:login', (_event, { username, password }: { username: string; password: string }) =>
  attemptLogin(username, password),
);
ipcMain.handle('twdb:resizeSmokeTest', () => resizeSmokeTest());
```

- [ ] **Step 3: Externalize sharp from the main bundle**

`sharp` is a native module and must not be bundled by Vite; keep it in `node_modules` (it ships as a runtime dependency of `twdb-client`) so `auto-unpack-natives` can place its binary outside the asar. `twdb-client` itself is pure JS and stays bundled.

Replace `vite.main.config.ts` with:

```ts
import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // sharp is a native addon — leave it external so its prebuilt binary
      // is required from node_modules at runtime (unpacked from the asar).
      external: ['sharp'],
    },
  },
});
```

- [ ] **Step 4: Verify dev still boots with handlers registered**

Run: `npm start`
Expected: window opens, no errors. (UI still shows the placeholder heading; wired up in Task 5.) Close the window.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: wire IPC bridge for login and sharp smoke test"
```

---

### Task 5: React login UI driving the IPC bridge

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Implement the login + smoke-test UI**

Replace `src/App.tsx` with:

```tsx
import { useState, type FormEvent } from 'react';

declare global {
  interface Window {
    figureshift: {
      login: (username: string, password: string) => Promise<{ ok: boolean; message?: string }>;
      resizeSmokeTest: () => Promise<{ ok: boolean; bytes: number; contentType: string; message?: string }>;
    };
  }
}

export function App() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [smoke, setSmoke] = useState('');

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setStatus('Logging in…');
    const res = await window.figureshift.login(username, password);
    setStatus(res.ok ? 'Logged in to TWDB ✓' : (res.message ?? 'Login failed'));
  }

  async function onSmoke() {
    setSmoke('Running sharp resize…');
    const res = await window.figureshift.resizeSmokeTest();
    setSmoke(res.ok ? `sharp OK: ${res.bytes} bytes, ${res.contentType}` : `sharp FAILED: ${res.message ?? 'unknown'}`);
  }

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
      <button onClick={onSmoke}>Run sharp smoke test</button>
      <p>{smoke}</p>
    </main>
  );
}
```

- [ ] **Step 2: Verify the full dev round-trip**

Run: `npm start`
Expected: enter real TWDB credentials → **Log in** → status shows `Logged in to TWDB ✓` (or a friendly failure with bad creds). Click **Run sharp smoke test** → shows `sharp OK: <N> bytes, image/jpeg`. Close the window.

(This is the be-a-good-citizen-respecting live check: one real login, no hammering.)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: React login UI + sharp smoke-test button"
```

---

### Task 6: Package, sign (ad-hoc), and verify the packaged app

**Files:**
- Modify: `forge.config.ts`
- Create: `.env.example`

- [ ] **Step 1: Configure makers, native unpacking, and gated signing**

Edit `forge.config.ts`:

1. Add imports at the top:
```ts
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { MakerDMG } from '@electron-forge/maker-dmg';
```

2. Define the notarize config above the exported config object:
```ts
const osxNotarize =
  process.env.APPLE_ID && process.env.APPLE_PASSWORD && process.env.APPLE_TEAM_ID
    ? {
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID,
      }
    : undefined;
```

3. Set `packagerConfig` (merge with the template's existing one):
```ts
packagerConfig: {
  asar: true,
  osxSign: { identity: process.env.APPLE_IDENTITY || '-' }, // '-' = ad-hoc
  osxNotarize,
},
```

4. Add the DMG maker to the `makers` array (keep the template's MakerZIP for darwin):
```ts
new MakerDMG({}, ['darwin']),
```

5. Add the auto-unpack-natives plugin to the `plugins` array (keep VitePlugin and FusesPlugin):
```ts
new AutoUnpackNativesPlugin({}),
```

- [ ] **Step 2: Create `.env.example` documenting the signing knobs**

```bash
# macOS code signing / notarization (all optional).
# Leave unset for local ad-hoc signing (identity '-').
# Set APPLE_IDENTITY to your "Developer ID Application: ..." name to sign for distribution.
APPLE_IDENTITY=
# Set all three to enable notarization during `npm run make`:
APPLE_ID=
APPLE_PASSWORD=
APPLE_TEAM_ID=
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all Vitest tests pass (4 total across the two `*.test.ts` files).

- [ ] **Step 4: Build the packaged, signed installer**

Run: `npm run make`
Expected: completes without errors; artifacts appear under `out/make/` (a `.dmg` and a `.zip` for darwin) and the packaged app under `out/FigureShift-darwin-*/FigureShift.app`.

- [ ] **Step 5: Verify the signature and native-module unpacking**

Run:
```bash
codesign -dv --verbose=4 out/FigureShift-darwin-*/FigureShift.app 2>&1 | grep -i signature
ls out/FigureShift-darwin-*/FigureShift.app/Contents/Resources/app.asar.unpacked/node_modules | grep -i sharp
```
Expected: signature line reports `Signature=adhoc` (or a Developer ID if `APPLE_IDENTITY` was set); the second command lists `sharp`-related package(s), confirming the native binary was unpacked from the asar.

- [ ] **Step 6: Run the packaged app and verify login + sharp (the real proof)**

Run:
```bash
open out/FigureShift-darwin-*/FigureShift.app
```
Expected: the **packaged** app launches. Enter real TWDB credentials → status shows `Logged in to TWDB ✓`. Click **Run sharp smoke test** → shows `sharp OK: <N> bytes, image/jpeg`. This proves the signed, packaged build runs `twdb-client` and `sharp` correctly outside dev mode — the spike's success criterion.

**Troubleshooting (if the packaged app fails where dev worked):**
- *sharp fails to load in packaged app:* confirm `sharp` is under `app.asar.unpacked` (Step 5). If a transitive native dep also errors, add its package name to `external` in `vite.main.config.ts`.
- *`twdb-client` import errors in packaged main:* confirm it's bundled (not in `external`); only `sharp` should be external.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: package + ad-hoc sign with gated notarization; verify packaged build"
```

---

## After All Tasks

Run the final code review across the whole branch, then use `superpowers:finishing-a-development-branch` to decide how to integrate (likely: keep the branch / open a PR, since this is the foundation slice). Record any packaging gotchas discovered into the project memory so slices 2–5 inherit them.

## Self-Review Notes

- **Spec coverage:** scaffold (Forge Vite+TS+React), `twdb-client` in main process (Task 2/4), `sharp` survives packaging (Task 3 + Task 6 Step 5/6), code-signing wired + notarization gated (Task 6), installable artifact (DMG, Task 6). Credentials/`safeStorage` and inference are later slices, intentionally out of scope here.
- **Types consistent:** `LoginResult` (`{ok, message?}`) and `SmokeTestResult` (`{ok, bytes, contentType, message?}`) match across main modules, preload, and the renderer's `window.figureshift` declaration.
- **No placeholders:** all code, the base64 fixture, and exact commands with expected output are inline.
