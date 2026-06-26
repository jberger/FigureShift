import { useEffect, useState } from 'react';
import type { ScannedMachine } from '../main/scan';
import type { MachineDoc } from '../main/machineYaml';
import { MachineList } from './MachineList';
import { MachineEditor } from './MachineEditor';

export function ReviewScreen({ machines: initial }: { machines: ScannedMachine[] }) {
  const [machines, setMachines] = useState(initial);
  const [selected, setSelected] = useState(0);
  const [brands, setBrands] = useState<string[]>([]);

  useEffect(() => {
    window.figureshift.brands().then(setBrands);
  }, []);

  if (machines.length === 0) return <p style={{ padding: 16 }}>No machines found.</p>;

  const current = machines[selected];

  function onSaved(doc: MachineDoc) {
    setMachines((ms) => ms.map((m, i) => (i === selected ? { ...m, machine: doc } : m)));
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <MachineList machines={machines} selected={selected} onSelect={setSelected} />
      <MachineEditor key={current.relPath} machine={current} brands={brands} onSaved={onSaved} />
    </div>
  );
}
