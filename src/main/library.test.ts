import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isImageFile, findMachineDirs } from './library';

function tree() {
  const root = mkdtempSync(path.join(tmpdir(), 'fs-lib-'));
  mkdirSync(path.join(root, 'Royal', '1948 Quiet'), { recursive: true });
  writeFileSync(path.join(root, 'Royal', '1948 Quiet', 'a.jpg'), 'x');
  writeFileSync(path.join(root, 'Royal', '1948 Quiet', 'b.JPG'), 'x');
  mkdirSync(path.join(root, 'Continental'), { recursive: true });
  mkdirSync(path.join(root, 'Continental', 'Klein'), { recursive: true });
  writeFileSync(path.join(root, 'Continental', 'Klein', 'c.png'), 'x');
  writeFileSync(path.join(root, 'notes.txt'), 'x');
  return root;
}

describe('library', () => {
  it('isImageFile recognizes common extensions, case-insensitive', () => {
    expect(isImageFile('a.jpg')).toBe(true);
    expect(isImageFile('a.JPG')).toBe(true);
    expect(isImageFile('a.png')).toBe(true);
    expect(isImageFile('a.txt')).toBe(false);
  });

  it('detects only folders that directly contain image files, paths relative to root', () => {
    const root = tree();
    const dirs = findMachineDirs(root).map((d) => d.relPath).sort();
    expect(dirs).toEqual(['Continental/Klein', 'Royal/1948 Quiet']);
  });
});
