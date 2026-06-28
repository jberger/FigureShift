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
    <>
      <p className="progress">
        {onTwdb} of {machines.length} on TWDB
      </p>
      <ul className="machine-list">
        {machines.map((m, i) => (
          <li key={m.relPath}>
            <button
              className={`machine-row${i === selected ? ' is-selected' : ''}`}
              onClick={() => onSelect(i)}
            >
              <span className="title">
                {m.machine.make ?? '?'} {m.machine.model ?? ''}
              </span>{' '}
              {m.status === 'onTwdb' ? (
                <span className="pill pill-twdb">on TWDB ✓</span>
              ) : m.machine.ready ? (
                <span className="pill pill-ready">ready</span>
              ) : (
                <span className="pill pill-new">new</span>
              )}
              <small>{m.relPath}</small>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
