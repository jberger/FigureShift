import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { ScannedMachine } from './main/scan';
import { ReviewScreen } from './renderer/ReviewScreen';
import { Walkthrough } from './renderer/Walkthrough';
import { ThemeToggle } from './renderer/theme';

export function App() {
  const [phase, setPhase] = useState<'loading' | 'login' | 'ready'>('loading');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [status, setStatus] = useState('');
  const [machines, setMachines] = useState<ScannedMachine[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [savedRoot, setSavedRoot] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('fs-onboarded')) setShowHelp(true);
    window.figureshift.getLibraryRoot().then(setSavedRoot);
    window.figureshift.autoLogin().then((r) => {
      setUsername(r.username);
      setPhase(r.ok ? 'ready' : 'login');
    });
    // Menu items (File ▸ Open Library Folder… / Log Out) drive the same renderer flows from anywhere.
    const unsubLib = window.figureshift.onChangeLibrary(() => onPick());
    const unsubLogout = window.figureshift.onMenuLogout(() => onLogout());
    return () => {
      unsubLib();
      unsubLogout();
    };
  }, []);

  function closeHelp() {
    localStorage.setItem('fs-onboarded', '1');
    setShowHelp(false);
  }

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setStatus('Logging in…');
    const res = await window.figureshift.login(username, password, remember);
    if (res.ok) {
      setStatus('');
      setPassword('');
      setPhase('ready');
    } else {
      setStatus(res.message ?? 'Login failed');
    }
  }

  async function onLogout() {
    await window.figureshift.logout();
    setMachines(null);
    setPassword('');
    setPhase('login');
  }

  async function scanRoot(root: string) {
    setScanning(true);
    setScanErr('');
    try {
      setMachines(await window.figureshift.scan(root));
      setSavedRoot(root);
    } catch (e) {
      setScanErr(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  }

  async function onPick() {
    const picked = await window.figureshift.pickRoot();
    if (picked) await scanRoot(picked);
  }

  const helpLink = (
    <p className="hint">
      <button className="link-btn" onClick={() => setShowHelp(true)}>
        How it works
      </button>
      {' · '}
      <ThemeToggle />
    </p>
  );

  let content: ReactNode;
  if (machines) {
    content = <ReviewScreen machines={machines} onHelp={() => setShowHelp(true)} />;
  } else if (phase === 'loading') {
    content = (
      <div className="auth">
        <div className="auth-card card">
          <h1>FigureShift</h1>
          <p className="status">Signing in…</p>
        </div>
      </div>
    );
  } else if (phase === 'ready') {
    content = (
      <div className="auth">
        <div className="auth-card card">
          <h1>FigureShift</h1>
          <p>Logged in{username ? ` as ${username}` : ''} ✓</p>
          {savedRoot && (
            <button
              className="btn btn-primary"
              style={{ width: '100%', marginBottom: 8 }}
              onClick={() => scanRoot(savedRoot)}
              disabled={scanning}
            >
              Reopen “{savedRoot.split(/[/\\]/).filter(Boolean).pop()}”
            </button>
          )}
          <div className="row">
            <button
              className={`btn ${savedRoot ? 'btn-secondary' : 'btn-primary'}`}
              onClick={onPick}
              disabled={scanning}
            >
              {savedRoot ? 'Pick a different folder…' : 'Pick library folder…'}
            </button>
            <button className="btn btn-secondary" onClick={onLogout} disabled={scanning}>
              Log out
            </button>
          </div>
          {scanning && <p className="status">Scanning your library…</p>}
          {scanErr && <p className="status error">Scan failed: {scanErr}</p>}
          <p className="hint">
            Tip: put each typewriter's photos in its own folder (named like its make &amp; model), then
            pick the folder that holds them all.
          </p>
          {helpLink}
        </div>
      </div>
    );
  } else {
    content = (
      <div className="auth">
        <div className="auth-card card">
          <h1>FigureShift</h1>
          <p className="status">Sign in to the Typewriter Database.</p>
          <form onSubmit={onLogin}>
            <input placeholder="TWDB username" value={username} onChange={(e) => setUsername(e.target.value)} />
            <input
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <label className="remember">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember me
            </label>
            <button className="btn btn-primary" type="submit">
              Log in
            </button>
          </form>
          {status && <p className={`status${status === 'Logging in…' ? '' : ' error'}`}>{status}</p>}
          <p className="hint">
            Your password is stored only on this computer, in its secure credential store (Keychain on
            macOS, Credential Manager on Windows) — never shared except to log in to the Typewriter
            Database.
          </p>
          {helpLink}
        </div>
      </div>
    );
  }

  return (
    <>
      {content}
      {showHelp && <Walkthrough onClose={closeHelp} />}
    </>
  );
}
