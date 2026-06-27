import { useEffect, useState } from 'react';
import type { ScannedMachine } from '../main/scan';
import type { MachineDoc } from '../main/machineYaml';
import { MachineList } from './MachineList';
import { MachineEditor } from './MachineEditor';

export function ReviewScreen({ machines: initial }: { machines: ScannedMachine[] }) {
  const [machines, setMachines] = useState(initial);
  const [selected, setSelected] = useState(0);
  const [brands, setBrands] = useState<string[]>([]);
  const [pushAll, setPushAll] = useState('');

  useEffect(() => {
    window.figureshift.brands().then(setBrands);
  }, []);

  if (machines.length === 0) return <p style={{ padding: 16 }}>No machines found.</p>;

  const current = machines[selected];

  function onSaved(doc: MachineDoc) {
    setMachines((ms) => ms.map((m, i) => (i === selected ? { ...m, machine: doc } : m)));
  }

  function markPushed(i: number) {
    setMachines((ms) => ms.map((m, j) => (j === i ? { ...m, status: 'onTwdb' } : m)));
  }

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

  return (
    <div className="review">
      <nav className="sidebar">
        <MachineList machines={machines} selected={selected} onSelect={setSelected} />
        <div className="sidebar-foot">
          <button className="btn btn-secondary" onClick={pushAllReady}>
            Push all ready
          </button>
          {pushAll && <p className="note">{pushAll}</p>}
        </div>
      </nav>
      <MachineEditor
        key={current.relPath}
        machine={current}
        brands={brands}
        onSaved={onSaved}
        onPushed={() => markPushed(selected)}
      />
    </div>
  );
}
