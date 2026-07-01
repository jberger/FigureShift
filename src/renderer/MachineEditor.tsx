import { useEffect, useState } from 'react';
import { isValidTwdbYear } from '@joelberger/twdb-client/validate';
import type { Collection } from '@joelberger/twdb-client';
import type { MachineDoc, MachineLink, MachinePhoto } from '../main/machineYaml';
import type { ScannedMachine } from '../main/scan';
import { PhotoGrid } from './PhotoGrid';
import { PhotoEditorModal, type EditResult } from './PhotoEditorModal';
import { pushProgressLabel, type PushProgress } from '../main/pushProgress';

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
  const [progress, setProgress] = useState<PushProgress | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [missingFiles, setMissingFiles] = useState<string[]>([]);
  const [addedFiles, setAddedFiles] = useState<string[]>([]);
  const [rescanMsg, setRescanMsg] = useState('');

  useEffect(() => {
    setDoc(machine.machine);
    setPushMsg('');
    setPushedUrl('');
    setEditing(null);
    setRescanMsg('');
    setAddedFiles([]);
    setMissingFiles([]);
  }, [machine.relPath]);

  async function onEdited(r: EditResult) {
    if (r.mode === 'new' && r.newFile) {
      // The edited copy takes the original's place: inherit its role (cover/type-sample/gallery)
      // and caption, and skip the original.
      const orig = doc.photos.find((p) => p.file === r.originalFile);
      const next = doc.photos
        .map((p) => (p.file === r.originalFile ? { ...p, role: 'skip' as const } : p))
        .concat({ file: r.newFile, role: orig?.role ?? 'gallery', caption: orig?.caption });
      const nextDoc = { ...doc, photos: next };
      setDoc(nextDoc);
      await window.figureshift.saveMachine(machine.absPath, nextDoc);
      onSaved(nextDoc);
    } else {
      setRefreshKey((k) => k + 1); // overwrite: re-fetch the thumbnail
    }
    setEditing(null);
  }

  // Pick up photos added to (or removed from) the folder since the doc was loaded.
  // Merges new files into the in-memory doc so unsaved role/caption edits survive.
  async function rescan() {
    const res = await window.figureshift.rescan(machine.absPath);
    if (!res.ok) return;
    setMissingFiles(res.missing);
    const missingNote = res.missing.length
      ? ` ${res.missing.length} photo${res.missing.length > 1 ? 's are' : ' is'} missing.`
      : '';
    if (res.added.length === 0) {
      setAddedFiles([]);
      setRescanMsg(missingNote.trim());
      return;
    }
    const newPhotos: MachinePhoto[] = res.added.map((file) => ({ file, role: 'gallery' as const }));
    const nextDoc = { ...doc, photos: [...doc.photos, ...newPhotos] };
    setDoc(nextDoc);
    await window.figureshift.saveMachine(machine.absPath, nextDoc);
    onSaved(nextDoc);
    setAddedFiles(res.added);
    setRescanMsg(`Added ${res.added.length} new photo${res.added.length > 1 ? 's' : ''}.${missingNote}`);
  }

  // Runs on every mount — that includes the first tab shown at startup, since the first
  // render is itself a mount. ReviewScreen keys MachineEditor by relPath, so switching tabs
  // remounts and re-runs this. Do NOT add a guard that skips the initial run.
  useEffect(() => {
    rescan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machine.relPath]);

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
  const noSerial = doc.serialNo === 'N/A'; // the standard "this model had no serial" value
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

  async function setReady(v: boolean) {
    const nextDoc = { ...doc, ready: v };
    setDoc(nextDoc);
    await window.figureshift.saveMachine(machine.absPath, nextDoc);
    onSaved(nextDoc);
  }

  async function push() {
    setPushMsg('');
    await window.figureshift.saveMachine(machine.absPath, doc);
    onSaved(doc);
    setProgress({ phase: 'metadata' });
    const unsub = window.figureshift.onPushProgress((p) => setProgress(p));
    const res = await window.figureshift.push(machine.absPath);
    unsub();
    setProgress(null);
    if (res.ok) {
      setPushMsg(
        `${res.created ? 'Created' : 'Updated'} on TWDB — ${res.photosUploaded ?? 0} uploaded` +
          `, ${res.updated ?? 0} caption(s) updated, ${res.deleted ?? 0} deleted` +
          `${res.reordered ? ', photos reordered' : ''}.`,
      );
      setPushedUrl(res.url ?? '');
      onPushed();
    } else {
      setPushMsg(`Push failed: ${res.message ?? 'unknown error'}`);
    }
  }

  return (
    <section className="editor">
      <div className="editor-inner">
        <h2>
          {doc.make ?? '(not detected)'} {doc.model ?? ''}
        </h2>

        <label className="field">
          <span>Make</span>
          <select value={doc.make ?? ''} onChange={(e) => set('make', e.target.value)}>
            <option value="">— choose brand —</option>
            {brands.map((b, i) => (
              <option key={`${b}-${i}`} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Model</span>
          <input list="fs-models" value={doc.model ?? ''} onChange={(e) => set('model', e.target.value)} />
          <datalist id="fs-models">
            {models.map((m, i) => (
              <option key={`${m}-${i}`} value={m} />
            ))}
          </datalist>
        </label>

        <label className="field">
          <span>Year{!yearOk && <span className="needs"> — use NNNN or e.g. 192X</span>}</span>
          <input
            className={yearOk ? '' : 'invalid'}
            value={doc.year ?? ''}
            onChange={(e) => set('year', e.target.value)}
            style={{ maxWidth: 140 }}
          />
        </label>

        <label className="field">
          <span>Serial</span>
          <input
            value={doc.serialNo ?? ''}
            onChange={(e) => set('serialNo', e.target.value)}
            disabled={noSerial}
          />
        </label>
        <label className="remember" style={{ marginTop: -6, marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={noSerial}
            onChange={(e) => set('serialNo', e.target.checked ? 'N/A' : '')}
          />{' '}
          No serial number (this model didn't have one) — sends “N/A”
        </label>

        <label className="field">
          <span>Description</span>
          <textarea value={doc.description ?? ''} onChange={(e) => set('description', e.target.value)} rows={3} />
        </label>

        <label className="field">
          <span>Collection</span>
          <select
            value={doc.collection ?? 'My Collection'}
            onChange={(e) => setDoc((d) => ({ ...d, collection: e.target.value as Collection }))}
          >
            <option value="My Collection">My Collection</option>
            <option value="Parting Out">Parting Out</option>
            <option value="Sightings">Sightings</option>
          </select>
        </label>

        <fieldset>
          <legend>Links (optional)</legend>
          {(doc.links ?? []).map((l, i) => (
            <div key={i} className="link-row">
              <input placeholder="name" value={l.name} onChange={(e) => setLink(i, 'name', e.target.value)} style={{ maxWidth: 140 }} />
              <input placeholder="https://…" value={l.url} onChange={(e) => setLink(i, 'url', e.target.value)} />
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => removeLink(i)}>
                ✕
              </button>
            </div>
          ))}
          <button className="btn btn-secondary btn-sm" type="button" onClick={addLink}>
            + add link
          </button>
        </fieldset>
      </div>

      <div className="photos-head">
        <h3 className="photos-h">Photos</h3>
        <button className="btn btn-secondary btn-sm" type="button" onClick={rescan}>
          Check for new photos
        </button>
      </div>
      {rescanMsg && <p className="note">{rescanMsg}</p>}
      <p className="hint">
        Give each photo a role: one <strong>cover</strong>, one <strong>type sample</strong>, the rest{' '}
        <strong>gallery</strong>; mark anything you don't want uploaded as <strong>skip</strong>.
      </p>
      <PhotoGrid
        absPath={machine.absPath}
        photos={doc.photos}
        onChange={(photos) => setDoc((d) => ({ ...d, photos }))}
        onEdit={(file) => setEditing(file)}
        refreshKey={refreshKey}
        missing={missingFiles}
        added={addedFiles}
      />

      {editing && (
        <PhotoEditorModal
          dir={machine.absPath}
          file={editing}
          onClose={() => setEditing(null)}
          onEdited={onEdited}
        />
      )}

      <div className="push-section">
        <div style={{ marginTop: 4 }}>
          <button className="btn btn-primary" onClick={save} disabled={saving || !yearOk}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        <hr className="section-divider" />

        <label className="remember">
          <input type="checkbox" checked={!!doc.ready} onChange={(e) => setReady(e.target.checked)} /> Ready to
          upload to the Typewriter Database — I've checked the make, model, and year.
        </label>
        <p className="hint">
          Make, model, and year are <strong>best-effort guesses</strong> from your folder name. Please
          double-check them — uploading creates a public entry on the Typewriter Database.
        </p>

        <div className="push-bar">
          <button
            className="btn btn-primary"
            onClick={push}
            disabled={gaps.length > 0 || saving || progress !== null || !doc.ready}
            title={
              gaps.length ? `Needs: ${gaps.join(', ')}` : !doc.ready ? 'Check "Ready to upload" first' : ''
            }
          >
            {machine.status === 'onTwdb' ? 'Update on TWDB' : 'Push to TWDB'}
          </button>
          {gaps.length > 0 && <span className="needs">Needs: {gaps.join(', ')}</span>}
          {pushedUrl && (
            <button className="btn btn-secondary" onClick={() => window.figureshift.openExternal(pushedUrl)}>
              View on TWDB ↗
            </button>
          )}
        </div>
        {progress ? (
          <>
            <p className="status">{pushProgressLabel(progress)}</p>
            {progress.phase === 'upload' && progress.total ? (
              <div className="progress-bar">
                <span style={{ width: `${Math.round(((progress.current ?? 0) / progress.total) * 100)}%` }} />
              </div>
            ) : null}
          </>
        ) : (
          pushMsg && <p className={`status${pushMsg.startsWith('Push failed') ? ' error' : ' ok'}`}>{pushMsg}</p>
        )}
      </div>
    </section>
  );
}
