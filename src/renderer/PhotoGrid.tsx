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
        {photos.map((p) => (
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
            <button className="btn btn-secondary btn-sm" onClick={() => onEdit(p.file)}>
              Edit…
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
