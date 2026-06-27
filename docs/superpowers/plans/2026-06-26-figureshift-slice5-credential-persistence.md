# FigureShift Slice 5 — Credential Persistence (safeStorage + auto-login) Implementation Plan

> **For agentic workers:** execute inline (Electron-runtime feature; verified by running the app). Steps use `- [ ]`.

**Goal:** Optionally remember the TWDB password (encrypted via Electron `safeStorage`, OS-keychain-backed) and auto-log-in on launch, so occasional users don't retype it. Password never leaves the main process; falls back to the login form on any failure.

**Architecture:** `src/main/credentials.ts` encrypts the password with `safeStorage` to a file in `userData` (username stored plaintext alongside). Main gains `auth:autoLogin` (decrypt → login → set client, never sends the password to the renderer), `auth:logout` (clear), and a `remember` flag on `twdb:login`. The renderer becomes a small phase machine: `loading` (try auto-login) → `login` (form, username pre-filled, "Remember me") or `ready` (logged in → folder picker, with "Log out").

**Tech Stack:** Electron `safeStorage` + `app.getPath('userData')`; existing twdb-client/`attemptLogin`.

**Security:** ciphertext + plaintext username in `userData`; encryption key in the OS keychain. The renderer never receives the stored password (auto-login runs in main). On decrypt/auth failure, the stored password is cleared (stale), username kept for pre-fill.

**Scope:** remember-me + auto-login + logout. Not: multi-account, changing the username independently.

---

### Task 1: `credentials.ts`

**Files:** Create `src/main/credentials.ts`. Branch: `feat/slice5-credentials`.

```ts
import { app, safeStorage } from 'electron';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const credFile = () => path.join(app.getPath('userData'), 'twdb-cred.bin');
const userFile = () => path.join(app.getPath('userData'), 'twdb-user.txt');

export function canRemember(): boolean {
  return safeStorage.isEncryptionAvailable();
}

export function saveCredentials(username: string, password: string): void {
  if (!canRemember()) return;
  writeFileSync(credFile(), safeStorage.encryptString(password));
  writeFileSync(userFile(), username, 'utf8');
}

export function rememberedUsername(): string | null {
  try {
    return existsSync(userFile()) ? readFileSync(userFile(), 'utf8') : null;
  } catch {
    return null;
  }
}

export function loadCredentials(): { username: string; password: string } | null {
  try {
    if (!canRemember() || !existsSync(credFile()) || !existsSync(userFile())) return null;
    return {
      username: readFileSync(userFile(), 'utf8'),
      password: safeStorage.decryptString(readFileSync(credFile())),
    };
  } catch {
    return null;
  }
}

// Remove the stored password (e.g. it's stale/failed), keeping the username for pre-fill.
export function forgetPassword(): void {
  try { rmSync(credFile(), { force: true }); } catch { /* ignore */ }
}

// Full clear (explicit logout / "forget me").
export function clearCredentials(): void {
  forgetPassword();
  try { rmSync(userFile(), { force: true }); } catch { /* ignore */ }
}
```

- [ ] Create the file. (No unit test — safeStorage needs the Electron runtime.)

---

### Task 2: main IPC

**Files:** Modify `src/main.ts`.

- [ ] **Import:** `import { loadCredentials, saveCredentials, clearCredentials, forgetPassword, rememberedUsername } from './main/credentials';`

- [ ] **Update the login handler** to take `remember` and persist on success:

```ts
ipcMain.handle(
  'twdb:login',
  async (_event, { username, password, remember }: { username: string; password: string; remember?: boolean }) => {
    const c = new TwdbClient();
    const res = await attemptLogin(username, password, () => c);
    if (res.ok) {
      client = c;
      if (remember) saveCredentials(username, password);
      else clearCredentials();
    }
    return res;
  },
);
```

- [ ] **Add auto-login + logout handlers** (near the other auth IPC):

```ts
ipcMain.handle('auth:autoLogin', async () => {
  const creds = loadCredentials();
  if (!creds) return { ok: false, username: rememberedUsername() ?? '' };
  const c = new TwdbClient();
  const res = await attemptLogin(creds.username, creds.password, () => c);
  if (res.ok) {
    client = c;
    return { ok: true, username: creds.username };
  }
  forgetPassword(); // stale password; keep username for pre-fill
  return { ok: false, username: creds.username };
});

ipcMain.handle('auth:logout', () => {
  client = null;
  clearCredentials();
});
```

- [ ] Typecheck: `npx tsc --noEmit` → 0. Commit: `feat: safeStorage credential storage + auto-login/logout IPC`.

---

### Task 3: preload + types

**Files:** Modify `src/preload.ts`, `src/figureshift.d.ts`.

- [ ] **preload** — change `login` to pass `remember`, add the two handlers:

```ts
  login: (username: string, password: string, remember: boolean) =>
    ipcRenderer.invoke('twdb:login', { username, password, remember }),
  autoLogin: () => ipcRenderer.invoke('auth:autoLogin'),
  logout: () => ipcRenderer.invoke('auth:logout'),
```

- [ ] **figureshift.d.ts** — update the `figureshift` interface:

```ts
      login: (username: string, password: string, remember: boolean) => Promise<{ ok: boolean; message?: string }>;
      autoLogin: () => Promise<{ ok: boolean; username: string }>;
      logout: () => Promise<void>;
```

- [ ] Typecheck → 0. Commit with Task 4.

---

### Task 4: App phase machine (loading → login/ready)

**Files:** Modify `src/App.tsx`.

- [ ] Rework `App` to:
  - `phase` state: `'loading' | 'login' | 'ready'`; `username`, `password`, `remember` (default `true`), `status`, `machines`.
  - On mount, `useEffect`: `autoLogin()` → if `ok` set username + `phase 'ready'`; else set username (pre-fill) + `phase 'login'`.
  - `phase 'loading'`: render "Signing in…".
  - `phase 'login'`: the login form + a **Remember me** checkbox (`checked={remember}`); `onLogin` calls `login(username, password, remember)` → ok → `phase 'ready'`, else show `status`.
  - `phase 'ready'` (and `machines == null`): "Logged in as {username}" + **Pick library folder…** + a **Log out** button (`logout()` → reset `phase 'login'`, clear password, `machines null`).
  - `machines != null`: `<ReviewScreen machines={machines} />` (unchanged).

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import type { ScannedMachine } from './main/scan';
import { ReviewScreen } from './renderer/ReviewScreen';

export function App() {
  const [phase, setPhase] = useState<'loading' | 'login' | 'ready'>('loading');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [status, setStatus] = useState('');
  const [machines, setMachines] = useState<ScannedMachine[] | null>(null);

  useEffect(() => {
    window.figureshift.autoLogin().then((r) => {
      setUsername(r.username);
      setPhase(r.ok ? 'ready' : 'login');
    });
  }, []);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setStatus('Logging in…');
    const res = await window.figureshift.login(username, password, remember);
    if (res.ok) {
      setStatus('');
      setPassword('');
      setPhase('ready');
    } else setStatus(res.message ?? 'Login failed');
  }

  async function onLogout() {
    await window.figureshift.logout();
    setMachines(null);
    setPassword('');
    setPhase('login');
  }

  async function onPick() {
    const picked = await window.figureshift.pickRoot();
    if (picked) setMachines(await window.figureshift.scan(picked));
  }

  if (machines) return <ReviewScreen machines={machines} />;

  const wrap = { fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 360 } as const;
  if (phase === 'loading') return <main style={wrap}><h1>FigureShift</h1><p>Signing in…</p></main>;

  if (phase === 'ready') {
    return (
      <main style={wrap}>
        <h1>FigureShift</h1>
        <p>Logged in{username ? ` as ${username}` : ''} ✓</p>
        <button onClick={onPick}>Pick library folder…</button>{' '}
        <button onClick={onLogout}>Log out</button>
      </main>
    );
  }

  return (
    <main style={wrap}>
      <h1>FigureShift</h1>
      <form onSubmit={onLogin} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input placeholder="TWDB username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <label><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember me</label>
        <button type="submit">Log in</button>
      </form>
      <p>{status}</p>
    </main>
  );
}
```

- [ ] Typecheck (`npx tsc --noEmit` → 0) + `npm test` (green). Commit: `feat: remember-me + auto-login UI (phase machine, log out)`.

---

### Task 5: Live verification (the user)

- [ ] `npm start`: log in with **Remember me** checked → it works. Quit and `npm start` again → it should **auto-log-in** ("Signing in…" then "Logged in as …", no form). Click **Log out** → back to the form. Log in with **Remember me unchecked**, quit, relaunch → should show the form again (username may be pre-filled only if previously remembered). (On first save macOS may touch the keychain — expected.)

---

## After All Tasks

`npm test` green → `superpowers:finishing-a-development-branch`. Update `figureshift-resume`: credential persistence done; remaining polish = progress/error surfacing, onboarding; TODOs = clear-all-links, no-serial/Bing.

## Self-Review

- **Spec coverage:** password via safeStorage (OS keychain), username plaintext, auto-login each launch, fallback to manual on failure, opt-in remember + logout. Matches the design's credentials section.
- **Security:** renderer never gets the stored password; stale password cleared on failed auto-login.
- **Types:** `login(…, remember)`, `autoLogin → {ok, username}`, `logout` consistent across preload/d.ts/App.
