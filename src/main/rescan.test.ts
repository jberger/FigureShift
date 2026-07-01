import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { reconcileMachineDir } from './rescan';

// A machine folder with the given image files and a machine.yaml listing `listed`.
function machineDir(files: string[], listed: string[]): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'fs-rescan-'));
  for (const f of files) writeFileSync(path.join(dir, f), 'x');
  const photos = listed.map((f) => `  - {file: ${f}, role: gallery}`).join('\n');
  writeFileSync(path.join(dir, 'machine.yaml'), `make: Royal\nphotos:\n${photos}\n`);
  return dir;
}

describe('reconcileMachineDir', () => {
  it('reports image files on disk that are absent from the yaml as added, sorted', () => {
    const dir = machineDir(['a.jpg', 'c.jpg', 'b.jpg'], ['a.jpg']);
    const { added } = reconcileMachineDir(dir);
    expect(added).toEqual(['b.jpg', 'c.jpg']);
  });

  it('reports yaml photos whose file is gone from disk as missing', () => {
    const dir = machineDir(['a.jpg'], ['a.jpg', 'gone.jpg']);
    const { missing } = reconcileMachineDir(dir);
    expect(missing).toEqual(['gone.jpg']);
  });

  it('does not re-add already-listed files, including -edited copies', () => {
    const dir = machineDir(['a.jpg', 'a-edited.jpg'], ['a.jpg', 'a-edited.jpg']);
    expect(reconcileMachineDir(dir).added).toEqual([]);
  });

  it('ignores non-image files on disk', () => {
    const dir = machineDir(['a.jpg', 'notes.txt', 'machine.yaml'], ['a.jpg']);
    expect(reconcileMachineDir(dir).added).toEqual([]);
  });

  it('leaves machine.yaml unchanged on disk (report-only)', () => {
    const dir = machineDir(['a.jpg', 'b.jpg'], ['a.jpg']);
    const before = readFileSync(path.join(dir, 'machine.yaml'), 'utf8');
    reconcileMachineDir(dir);
    expect(readFileSync(path.join(dir, 'machine.yaml'), 'utf8')).toBe(before);
  });
});
