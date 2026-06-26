import { useState, type FormEvent } from 'react';

declare global {
  interface Window {
    figureshift: {
      login: (username: string, password: string) => Promise<{ ok: boolean; message?: string }>;
      resizeSmokeTest: () => Promise<{ ok: boolean; bytes: number; contentType: string; message?: string }>;
      pickRoot: () => Promise<string | null>;
      scan: (root: string) => Promise<
        Array<{
          relPath: string;
          status: 'new' | 'onTwdb';
          machine: { make?: string; model?: string; year?: string; photos: { file: string }[] };
        }>
      >;
    };
  }
}

type Scanned = Awaited<ReturnType<Window['figureshift']['scan']>>;

export function App() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [smoke, setSmoke] = useState('');
  const [root, setRoot] = useState('');
  const [machines, setMachines] = useState<Scanned>([]);

  async function onPick() {
    const picked = await window.figureshift.pickRoot();
    if (!picked) return;
    setRoot(picked);
    setMachines(await window.figureshift.scan(picked));
  }

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setStatus('Logging in…');
    const res = await window.figureshift.login(username, password);
    setStatus(res.ok ? 'Logged in to TWDB ✓' : (res.message ?? 'Login failed'));
  }

  async function onSmoke() {
    setSmoke('Running sharp resize…');
    const res = await window.figureshift.resizeSmokeTest();
    setSmoke(
      res.ok
        ? `sharp OK: ${res.bytes} bytes, ${res.contentType}`
        : `sharp FAILED: ${res.message ?? 'unknown'}`,
    );
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 560 }}>
      <h1>FigureShift</h1>
      <form onSubmit={onLogin} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
          placeholder="TWDB username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
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
      <button onClick={onSmoke}>Run sharp smoke test</button>
      <p>{smoke}</p>
      <hr />
      <button onClick={onPick}>Pick library folder…</button>
      {root && (
        <p>
          {machines.length} machine(s) in {root}
        </p>
      )}
      <ul>
        {machines.map((m) => (
          <li key={m.relPath}>
            <strong>{m.relPath}</strong> — {m.machine.make ?? '?'} {m.machine.model ?? ''}{' '}
            {m.machine.year ?? ''} [{m.status}] · {m.machine.photos.length} photo(s)
          </li>
        ))}
      </ul>
    </main>
  );
}
