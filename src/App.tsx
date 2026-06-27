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

  async function onPick() {
    const picked = await window.figureshift.pickRoot();
    if (picked) setMachines(await window.figureshift.scan(picked));
  }

  if (machines) return <ReviewScreen machines={machines} />;

  if (phase === 'loading') {
    return (
      <div className="auth">
        <div className="auth-card card">
          <h1>FigureShift</h1>
          <p className="status">Signing in…</p>
        </div>
      </div>
    );
  }

  if (phase === 'ready') {
    return (
      <div className="auth">
        <div className="auth-card card">
          <h1>FigureShift</h1>
          <p>Logged in{username ? ` as ${username}` : ''} ✓</p>
          <div className="row">
            <button className="btn btn-primary" onClick={onPick}>
              Pick library folder…
            </button>
            <button className="btn btn-secondary" onClick={onLogout}>
              Log out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
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
      </div>
    </div>
  );
}
