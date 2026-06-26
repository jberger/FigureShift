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
    setStatus(res.ok ? 'Logged in ✓ — pick your library folder below.' : (res.message ?? 'Login failed'));
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
        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit">Log in</button>
      </form>
      <p>{status}</p>
      <hr />
      <button onClick={onPick}>Pick library folder…</button>
    </main>
  );
}
