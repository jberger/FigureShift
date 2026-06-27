import { useEffect, useRef, useState } from 'react';
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';

export type EditResult = { mode: 'overwrite' | 'new'; originalFile: string; newFile?: string };

export function PhotoEditorModal({
  dir,
  file,
  onClose,
  onEdited,
}: {
  dir: string;
  file: string;
  onClose: () => void;
  onEdited: (r: EditResult) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const cropperRef = useRef<Cropper | null>(null);
  const [src, setSrc] = useState('');
  const [mode, setMode] = useState<'overwrite' | 'new'>('new');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Load the bytes over IPC (Chromium blocks cross-origin fetch of custom schemes), then wrap in a
  // same-origin blob URL so Cropper's exported canvas isn't tainted.
  useEffect(() => {
    let url = '';
    let live = true;
    window.figureshift
      .readPhoto({ dir, file })
      .then((res) => {
        if (!live) return;
        if (!res.ok || !res.bytes) {
          setErr(res.message ?? 'Could not load the image.');
          return;
        }
        url = URL.createObjectURL(new Blob([res.bytes as BlobPart]));
        setSrc(url);
      })
      .catch(() => live && setErr('Could not load the image.'));
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [dir, file]);

  // Init Cropper once the image src is set. Free crop box (aspectRatio: NaN), rotate + zoom enabled.
  useEffect(() => {
    if (!src || !imgRef.current) return;
    const cropper = new Cropper(imgRef.current, {
      viewMode: 1,
      autoCropArea: 1,
      aspectRatio: NaN,
      background: false,
    });
    cropperRef.current = cropper;
    return () => {
      cropper.destroy();
      cropperRef.current = null;
    };
  }, [src]);

  async function save() {
    const cropper = cropperRef.current;
    if (!cropper) return;
    setBusy(true);
    setErr('');
    try {
      const canvas = cropper.getCroppedCanvas();
      const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.92),
      );
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const res = await window.figureshift.saveEdit({ dir, file, mode, bytes });
      if (!res.ok) {
        setErr(res.message ?? 'Save failed.');
        setBusy(false);
        return;
      }
      onEdited({ mode, originalFile: file, newFile: res.file });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Edit photo</h3>
        <div className="crop-stage">
          {src && <img ref={imgRef} src={src} alt={file} style={{ display: 'block', maxWidth: '100%', maxHeight: '60vh' }} />}
        </div>
        <div className="crop-controls">
          <button className="btn btn-secondary btn-sm" onClick={() => cropperRef.current?.rotate(-90)}>
            ⟲ Rotate left
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => cropperRef.current?.rotate(90)}>
            ⟳ Rotate right
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => cropperRef.current?.zoom(0.1)}>
            Zoom in
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => cropperRef.current?.zoom(-0.1)}>
            Zoom out
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => cropperRef.current?.reset()}>
            Reset
          </button>
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Drag the box edges to crop freely.</span>
        </div>
        <div className="crop-save">
          <label className="remember">
            <input type="radio" name="savemode" checked={mode === 'new'} onChange={() => setMode('new')} /> Save as new (copy)
          </label>
          <label className="remember">
            <input type="radio" name="savemode" checked={mode === 'overwrite'} onChange={() => setMode('overwrite')} /> Overwrite
          </label>
        </div>
        {err && <p className="status error">{err}</p>}
        <div className="push-bar">
          <button className="btn btn-primary" onClick={save} disabled={busy || !src}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
