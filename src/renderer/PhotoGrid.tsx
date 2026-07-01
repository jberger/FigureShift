import { useState, type ReactNode } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { setRole } from '../main/photoRoles';
import type { MachinePhoto, PhotoRole } from '../main/machineYaml';

const ROLES: PhotoRole[] = ['cover', 'typeSample', 'gallery', 'skip'];

// Smallest card width — enough for the grip + ◀/▶ on one row. Also the slider's minimum, so the slider
// effectively sets the card width (fixed-width columns) rather than stretching cards to fill the row.
const MIN_CARD = 140;
const MAX_CARD = 340;

function thumbUrl(absPath: string, file: string, key: number) {
  return `figimg://f/${encodeURIComponent(`${absPath}/${file}`)}?k=${key}`;
}

// A gallery card wrapped for drag-to-reorder. Hands the drag props down (render-prop) so the grip can
// live in the actions row alongside the arrows + Edit, instead of floating at the top.
function SortablePhoto({
  id,
  className,
  children,
}: {
  id: string;
  className: string;
  children: (drag: Record<string, unknown>) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
    zIndex: isDragging ? 1 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className={className}>
      {children({ ...attributes, ...listeners })}
    </div>
  );
}

export function PhotoGrid({
  absPath,
  photos,
  onChange,
  onEdit,
  refreshKey,
  missing,
  added,
}: {
  absPath: string;
  photos: MachinePhoto[];
  onChange: (photos: MachinePhoto[]) => void;
  onEdit: (file: string) => void;
  refreshKey: number;
  missing: string[];
  added: string[];
}) {
  // Thumbnail tile size (px), persisted so it sticks across machines/sessions.
  const [size, setSize] = useState(() => Number(localStorage.getItem('fs-thumb')) || 160);
  const onSize = (v: number) => {
    setSize(v);
    localStorage.setItem('fs-thumb', String(v));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const setCaption = (file: string, caption: string) =>
    onChange(photos.map((p) => (p.file === file ? { ...p, caption } : p)));

  // Write a reordered gallery sequence back into the gallery slots of doc.photos, leaving cover/
  // type-sample/skip photos in place. Push uploads gallery photos in this order and sets the TWDB
  // gallery order to match.
  const applyGalleryOrder = (newGallery: MachinePhoto[]) => {
    let g = 0;
    onChange(photos.map((p) => (p.role === 'gallery' ? newGallery[g++] : p)));
  };

  const moveGallery = (file: string, delta: number) => {
    const oldIndex = gallery.findIndex((p) => p.file === file);
    const newIndex = oldIndex + delta;
    if (newIndex < 0 || newIndex >= gallery.length) return;
    applyGalleryOrder(arrayMove(gallery, oldIndex, newIndex));
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = gallery.findIndex((p) => p.file === active.id);
    const newIndex = gallery.findIndex((p) => p.file === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    applyGalleryOrder(arrayMove(gallery, oldIndex, newIndex));
  };

  // The slider sets the card width directly; fixed-width columns (no 1fr stretch) keep resizing smooth
  // and the box aspect constant, so column-count changes just adjust trailing space.
  const eff = Math.min(Math.max(size, MIN_CARD), MAX_CARD);
  const gridStyle = { gridTemplateColumns: `repeat(auto-fill, ${eff}px)` };

  const cover = photos.find((p) => p.role === 'cover');
  const typeSample = photos.find((p) => p.role === 'typeSample');
  const gallery = photos.filter((p) => p.role === 'gallery');
  const skipped = photos.filter((p) => p.role === 'skip');

  const missingSet = new Set(missing);
  const addedSet = new Set(added);
  const cardClass = (p: MachinePhoto) =>
    `photo-card${p.role === 'skip' ? ' is-skip' : ''}` +
    `${missingSet.has(p.file) ? ' is-missing' : ''}${addedSet.has(p.file) ? ' is-new' : ''}`;

  // The img/select/caption/actions shared by plain cards and sortable gallery cards.
  const inner = (
    p: MachinePhoto,
    order?: { idx: number; total: number },
    drag?: Record<string, unknown>,
  ): ReactNode => (
    <>
      <div className="photo-thumb">
        {missingSet.has(p.file) ? (
          <div className="photo-missing" style={{ height: Math.round(eff * 0.72) }}>
            <span>File not found</span>
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              onClick={() => onChange(photos.filter((x) => x.file !== p.file))}
            >
              Remove
            </button>
          </div>
        ) : (
          <>
            <img
              src={thumbUrl(absPath, p.file, refreshKey)}
              alt={p.file}
              style={{ height: Math.round(eff * 0.72) }}
            />
            <button className="photo-edit-overlay" onClick={() => onEdit(p.file)} title="Edit photo">
              Edit
            </button>
          </>
        )}
      </div>
      <select value={p.role} onChange={(e) => onChange(setRole(photos, p.file, e.target.value as PhotoRole))}>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <input placeholder="caption" value={p.caption ?? ''} onChange={(e) => setCaption(p.file, e.target.value)} />
      {drag && (
        <div className="photo-actions">
          <button className="drag-handle" {...drag} title="Drag to reorder" aria-label="Drag to reorder">
            ⠿
          </button>
          {order && (
            <span className="photo-arrows">
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
            </span>
          )}
        </div>
      )}
    </>
  );

  const plainCard = (p: MachinePhoto) => (
    <div key={p.file} className={cardClass(p)}>
      {inner(p)}
    </div>
  );

  return (
    <>
      <div className="photo-controls">
        <label htmlFor="thumb-size">Thumbnail size</label>
        <input
          id="thumb-size"
          type="range"
          min={MIN_CARD}
          max={MAX_CARD}
          value={eff}
          onChange={(e) => onSize(Number(e.target.value))}
        />
      </div>

      <div className="photo-section">
        <h4 className="photo-section-h">Cover &amp; type sample</h4>
        <div className="photo-grid" style={gridStyle}>
          {cover ? plainCard(cover) : <div className="photo-empty">No cover yet — set a photo's role to “cover”.</div>}
          {typeSample ? (
            plainCard(typeSample)
          ) : (
            <div className="photo-empty">No type sample yet — set a photo's role to “typeSample”.</div>
          )}
        </div>
      </div>

      <div className="photo-section">
        <h4 className="photo-section-h">Gallery — drag (or ◀ ▶) to order; this is the TWDB order</h4>
        {gallery.length ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={gallery.map((p) => p.file)} strategy={rectSortingStrategy}>
              <div className="photo-grid" style={gridStyle}>
                {gallery.map((p, i) => (
                  <SortablePhoto key={p.file} id={p.file} className={cardClass(p)}>
                    {(drag) => inner(p, { idx: i, total: gallery.length }, drag)}
                  </SortablePhoto>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <p className="hint">No gallery photos yet.</p>
        )}
      </div>

      {skipped.length > 0 && (
        <div className="photo-section">
          <h4 className="photo-section-h">Skipped — won't be uploaded</h4>
          <div className="photo-grid" style={gridStyle}>
            {skipped.map((p) => plainCard(p))}
          </div>
        </div>
      )}
    </>
  );
}
