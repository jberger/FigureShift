import type { MachinePhoto, PhotoRole } from './machineYaml';

const EXCLUSIVE: PhotoRole[] = ['cover', 'typeSample'];

// Set `file`'s role. cover and typeSample are exclusive: assigning one to a photo demotes
// whichever other photo currently holds that role back to 'gallery'. Returns a new array.
export function setRole(photos: MachinePhoto[], file: string, role: PhotoRole): MachinePhoto[] {
  return photos.map((p) => {
    if (p.file === file) return { ...p, role };
    if (EXCLUSIVE.includes(role) && p.role === role) return { ...p, role: 'gallery' };
    return p;
  });
}
