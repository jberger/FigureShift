import { useEffect, useState } from 'react';
import { isValidTwdbYear } from '@joelberger/twdb-client/validate';
import type { Collection } from '@joelberger/twdb-client';
import type { MachineDoc, MachineLink } from '../main/machineYaml';
import type { ScannedMachine } from '../main/scan';
import { PhotoGrid } from './PhotoGrid';

// Renderer-safe readiness mirror of the main-process missingPushFields (which pulls in the Node client).
function missing(doc: MachineDoc): string[] {
  const m: string[] = [];
  if (!doc.make?.trim()) m.push('make');
  if (!doc.model?.trim()) m.push('model');
  if (!doc.year || !isValidTwdbYear(doc.year)) m.push('a valid year');
  if (!doc.serialNo?.trim()) m.push('a serial number');
  if (!doc.description?.trim()) m.push('description');
  if (!doc.photos.some((p) => p.role === 'cover')) m.push('a cover photo');
  return m;
}

export function MachineEditor({
  machine,
  brands,
  onSaved,
  onPushed,
}: {
  machine: ScannedMachine;
  brands: string[];
  onSaved: (doc: MachineDoc) => void;
  onPushed: () => void;
}) {
  const [doc, setDoc] = useState<MachineDoc>(machine.machine);
  const [models, setModels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [pushMsg, setPushMsg] = useState('');
  const [pushedUrl, setPushedUrl] = useState('');

  // Reset the form when a different machine is selected.
  useEffect(() => {
    setDoc(machine.machine);
    setPushMsg('');
    setPushedUrl('');
  }, [machine.relPath]);

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
  const gaps = missing(doc);

  const addLink = () => setDoc((d) => ({ ...d, links: [...(d.links ?? []), { name: '', url: '' }] }));
  const setLink = (i: number, k: keyof MachineLink, v: string) =>
    setDoc((d) => ({ ...d, links: (d.links ?? []).map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));
  const removeLink = (i: number) => setDoc((d) => ({ ...d, links: (d.links ?? []).filter((_, j) => j !== i) }));

  async function save() {
    setSaving(true);
    await window.figureshift.saveMachine(machine.absPath, doc);
    setSaving(false);
    onSaved(doc);
  }

  async function push() {
    setPushMsg('Saving…');
    await window.figureshift.saveMachine(machine.absPath, doc);
    onSaved(doc);
    setPushMsg('Pushing to TWDB…');
    const res = await window.figureshift.push(machine.absPath);
    if (res.ok) {
      setPushMsg(`${res.created ? 'Created' : 'Updated'} on TWDB — ${res.photosUploaded ?? 0} photo(s) uploaded.`);
      setPushedUrl(res.url ?? '');
      onPushed();
    } else {
      setPushMsg(`Push failed: ${res.message ?? 'unknown error'}`);
    }
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
        Collection
        <select
          value={doc.collection ?? 'My Collection'}
          onChange={(e) => setDoc((d) => ({ ...d, collection: e.target.value as Collection }))}
          style={{ width: '100%' }}
        >
          <option value="My Collection">My Collection</option>
          <option value="Parting Out">Parting Out</option>
          <option value="Sightings">Sightings</option>
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

      <fieldset style={{ marginBottom: 8 }}>
        <legend>Links (optional)</legend>
        {(doc.links ?? []).map((l, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
            <input placeholder="name" value={l.name} onChange={(e) => setLink(i, 'name', e.target.value)} />
            <input
              placeholder="https://…"
              value={l.url}
              onChange={(e) => setLink(i, 'url', e.target.value)}
              style={{ flex: 1 }}
            />
            <button type="button" onClick={() => removeLink(i)}>
              ✕
            </button>
          </div>
        ))}
        <button type="button" onClick={addLink}>
          + add link
        </button>
      </fieldset>

      <PhotoGrid
        absPath={machine.absPath}
        photos={doc.photos}
        onChange={(photos) => setDoc((d) => ({ ...d, photos }))}
      />

      <div style={{ marginTop: 12 }}>
        <button onClick={save} disabled={saving || !yearOk}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <hr />
      <div>
        <button onClick={push} disabled={gaps.length > 0 || saving} title={gaps.length ? `Needs: ${gaps.join(', ')}` : ''}>
          {machine.status === 'onTwdb' ? 'Push new photos' : 'Push to TWDB'}
        </button>
        {gaps.length > 0 && <span style={{ color: '#a60', marginLeft: 8 }}>Needs: {gaps.join(', ')}</span>}
        {pushMsg && <p>{pushMsg}</p>}
        {pushedUrl && (
          <button onClick={() => window.figureshift.openExternal(pushedUrl)}>View on TWDB ↗</button>
        )}
      </div>
    </section>
  );
}
