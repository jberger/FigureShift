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
    <nav style={{ borderRight: '1px solid #ccc', overflowY: 'auto', minWidth: 220, maxWidth: 280 }}>
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
