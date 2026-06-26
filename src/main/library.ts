import { readdirSync } from 'node:fs';
import path from 'node:path';

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.tif', '.tiff']);

export function isImageFile(name: string): boolean {
  return IMAGE_EXTS.has(path.extname(name).toLowerCase());
}

export interface MachineDir {
  absPath: string;
  relPath: string;        // POSIX-style, relative to the library root
  imageFiles: string[];
}

// A folder that *directly* contains image files is a machine (spec heuristic).
export function findMachineDirs(root: string): MachineDir[] {
  const out: MachineDir[] = [];
  const walk = (abs: string) => {
    let entries;
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    const imageFiles = entries.filter((e) => e.isFile() && isImageFile(e.name)).map((e) => e.name);
    if (imageFiles.length > 0) {
      const rel = path.relative(root, abs).split(path.sep).join('/');
      out.push({ absPath: abs, relPath: rel, imageFiles: imageFiles.sort() });
    }
    for (const e of entries) if (e.isDirectory()) walk(path.join(abs, e.name));
  };
  walk(root);
  return out;
}
