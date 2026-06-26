import { setRole } from '../main/photoRoles';
import type { MachinePhoto, PhotoRole } from '../main/machineYaml';

const ROLES: PhotoRole[] = ['cover', 'typeSample', 'gallery', 'skip'];

function thumbUrl(absPath: string, file: string) {
  return `figimg://f/${encodeURIComponent(`${absPath}/${file}`)}`;
}

export function PhotoGrid({
  absPath,
  photos,
  onChange,
}: {
  absPath: string;
  photos: MachinePhoto[];
  onChange: (photos: MachinePhoto[]) => void;
}) {
  const setCaption = (file: string, caption: string) =>
    onChange(photos.map((p) => (p.file === file ? { ...p, caption } : p)));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
      {photos.map((p) => (
        <div key={p.file} style={{ border: '1px solid #ddd', padding: 6 }}>
          <img
            src={thumbUrl(absPath, p.file)}
            alt={p.file}
            style={{ width: '100%', height: 100, objectFit: 'cover', opacity: p.role === 'skip' ? 0.4 : 1 }}
          />
          <select
            value={p.role}
            onChange={(e) => onChange(setRole(photos, p.file, e.target.value as PhotoRole))}
            style={{ width: '100%' }}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <input
            placeholder="caption"
            value={p.caption ?? ''}
            onChange={(e) => setCaption(p.file, e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
      ))}
    </div>
  );
}
