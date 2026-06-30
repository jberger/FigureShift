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

  // Reorder a gallery photo by swapping with the previous/next *gallery* photo (cover/type-sample/skip
  // sit in their own sections and don't affect gallery order). Push uploads gallery photos in this
  // array order and sets the TWDB gallery order to match.
  const moveGallery = (file: string, delta: number) => {
    const galleryIdxs = photos.map((p, i) => (p.role === 'gallery' ? i : -1)).filter((i) => i >= 0);
    const pos = photos.findIndex((p) => p.file === file);
    const target = galleryIdxs[galleryIdxs.indexOf(pos) + delta];
    if (target === undefined) return;
    const next = photos.slice();
    [next[pos], next[target]] = [next[target], next[pos]];
    onChange(next);
  };

  const gridStyle = { gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))` };

  const cover = photos.find((p) => p.role === 'cover');
  const typeSample = photos.find((p) => p.role === 'typeSample');
  const gallery = photos.filter((p) => p.role === 'gallery');
  const skipped = photos.filter((p) => p.role === 'skip');

  const card = (p: MachinePhoto, order?: { idx: number; total: number }) => (
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
        {order && (
          <>
            <button
              className="btn btn-secondary btn-sm"
              disabled={order.idx === 0}
              title="Move earlier"
              onClick={() => moveGallery(p.file, -1)}
            >
              ◀
            </button>
            <button
              className="btn btn-secondary btn-sm"
              disabled={order.idx === order.total - 1}
              title="Move later"
              onClick={() => moveGallery(p.file, 1)}
            >
              ▶
            </button>
          </>
        )}
        <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => onEdit(p.file)}>
          Edit…
        </button>
      </div>
    </div>
  );

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

      <div className="photo-section">
        <h4 className="photo-section-h">Cover &amp; type sample</h4>
        <div className="photo-grid" style={gridStyle}>
          {cover ? card(cover) : <div className="photo-empty">No cover yet — set a photo's role to “cover”.</div>}
          {typeSample ? (
            card(typeSample)
          ) : (
            <div className="photo-empty">No type sample yet — set a photo's role to “typeSample”.</div>
          )}
        </div>
      </div>

      <div className="photo-section">
        <h4 className="photo-section-h">Gallery — order is what appears on TWDB</h4>
        {gallery.length ? (
          <div className="photo-grid" style={gridStyle}>
            {gallery.map((p, i) => card(p, { idx: i, total: gallery.length }))}
          </div>
        ) : (
          <p className="hint">No gallery photos yet.</p>
        )}
      </div>

      {skipped.length > 0 && (
        <div className="photo-section">
          <h4 className="photo-section-h">Skipped — won't be uploaded</h4>
          <div className="photo-grid" style={gridStyle}>
            {skipped.map((p) => card(p))}
          </div>
        </div>
      )}
    </>
  );
}
