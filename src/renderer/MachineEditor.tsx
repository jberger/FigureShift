import { useEffect, useState } from 'react';
import { isValidTwdbYear } from '@joelberger/twdb-client/validate';
import type { MachineDoc } from '../main/machineYaml';
import type { ScannedMachine } from '../main/scan';
import { PhotoGrid } from './PhotoGrid';

export function MachineEditor({
  machine,
  brands,
  onSaved,
}: {
  machine: ScannedMachine;
  brands: string[];
  onSaved: (doc: MachineDoc) => void;
}) {
  const [doc, setDoc] = useState<MachineDoc>(machine.machine);
  const [models, setModels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Reset the form when a different machine is selected.
  useEffect(() => setDoc(machine.machine), [machine.relPath]);

  // Fetch the selected make's models for the datalist (type-or-pick).
  useEffect(() => {
    const make = doc.make ?? '';
    if (!make) {
      setModels([]);
      return;
    }
    let live = true;
    window.figureshift.models(make).then((m) => {
      if (live) setModels(m);
    });
    return () => {
      live = false;
    };
  }, [doc.make]);

  const set = (k: keyof MachineDoc, v: string) => setDoc((d) => ({ ...d, [k]: v }));
  const yearOk = !doc.year || isValidTwdbYear(doc.year);

  async function save() {
    setSaving(true);
    await window.figureshift.saveMachine(machine.absPath, doc);
    setSaving(false);
    onSaved(doc);
  }

  return (
    <section style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
      <h2>
        {doc.make ?? '?'} {doc.model ?? ''}
      </h2>

      <label style={{ display: 'block', marginBottom: 8 }}>
        Make
        <select value={doc.make ?? ''} onChange={(e) => set('make', e.target.value)} style={{ width: '100%' }}>
          <option value="">— choose brand —</option>
          {brands.map((b, i) => (
            <option key={`${b}-${i}`} value={b}>
              {b}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: 'block', marginBottom: 8 }}>
        Model
        <input
          list="fs-models"
          value={doc.model ?? ''}
          onChange={(e) => set('model', e.target.value)}
          style={{ width: '100%' }}
        />
        <datalist id="fs-models">
          {models.map((m, i) => (
            <option key={`${m}-${i}`} value={m} />
          ))}
        </datalist>
      </label>

      <label style={{ display: 'block', marginBottom: 8 }}>
        Year
        <input
          value={doc.year ?? ''}
          onChange={(e) => set('year', e.target.value)}
          style={{ width: 120, borderColor: yearOk ? undefined : 'red' }}
        />
        {!yearOk && <span style={{ color: 'red' }}> use NNNN or e.g. 192X</span>}
      </label>

      <label style={{ display: 'block', marginBottom: 8 }}>
        Serial
        <input value={doc.serialNo ?? ''} onChange={(e) => set('serialNo', e.target.value)} style={{ width: '100%' }} />
      </label>

      <label style={{ display: 'block', marginBottom: 8 }}>
        Description
        <textarea
          value={doc.description ?? ''}
          onChange={(e) => set('description', e.target.value)}
          rows={3}
          style={{ width: '100%' }}
        />
      </label>

      <PhotoGrid
        absPath={machine.absPath}
        photos={doc.photos}
        onChange={(photos) => setDoc((d) => ({ ...d, photos }))}
      />

      <button onClick={save} disabled={saving || !yearOk} style={{ marginTop: 12 }}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </section>
  );
}
