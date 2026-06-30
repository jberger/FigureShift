import { useState } from 'react';
import { setRole } from '../main/photoRoles';
import type { MachinePhoto, PhotoRole } from '../main/machineYaml';

const ROLES: PhotoRole[] = ['cover', 'typeSample', 'gallery', 'skip'];

function thumbUrl(absPath: string, file: string, key: number) {
  return `figimg://f/${encodeURIComponent(`${absPath}/${file}`)}?k=${key}`;
}

export function PhotoGrid({
  absPath,
  photos,
  onChange,
  onEdit,
  refreshKey,
}: {
  absPath: string;
  photos: MachinePhoto[];
  onChange: (photos: MachinePhoto[]) => void;
  onEdit: (file: string) => void;
  refreshKey: number;
}) {
  // Thumbnail tile size (px), persisted so it sticks across machines/sessions.
  const [size, setSize] = useState(() => Number(localStorage.getItem('fs-thumb')) || 160);
  const onSize = (v: number) => {
    setSize(v);
    localStorage.setItem('fs-thumb', String(v));
  };

  const setCaption = (file: string, caption: string) =>
    onChange(photos.map((p) => (p.file === file ? { ...p, caption } : p)));

  // Reorder by swapping with a neighbour. Push uploads gallery photos in this array order, so this
  // sets the gallery sequence (for the next push; already-uploaded photos keep their TWDB order).
  const move = (idx: number, delta: number) => {
    const j = idx + delta;
    if (j < 0 || j >= photos.length) return;
    const next = photos.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };

  return (
    <>
      <div className="photo-controls">
        <label htmlFor="thumb-size">Thumbnail size</label>
        <input
          id="thumb-size"
          type="range"
          min={110}
          max={340}
          value={size}
          onChange={(e) => onSize(Number(e.target.value))}
        />
      </div>
      <div
        className="photo-grid"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))` }}
      >
        {photos.map((p, idx) => (
          <div key={p.file} className={`photo-card${p.role === 'skip' ? ' is-skip' : ''}`}>
            <img src={thumbUrl(absPath, p.file, refreshKey)} alt={p.file} style={{ height: Math.round(size * 0.72) }} />
            <select value={p.role} onChange={(e) => onChange(setRole(photos, p.file, e.target.value as PhotoRole))}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <input placeholder="caption" value={p.caption ?? ''} onChange={(e) => setCaption(p.file, e.target.value)} />
            <div className="photo-actions">
              <button
                className="btn btn-secondary btn-sm"
                disabled={idx === 0}
                title="Move earlier"
                onClick={() => move(idx, -1)}
              >
                ◀
              </button>
              <button
                className="btn btn-secondary btn-sm"
                disabled={idx === photos.length - 1}
                title="Move later"
                onClick={() => move(idx, 1)}
              >
                ▶
              </button>
              <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => onEdit(p.file)}>
                Edit…
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
