import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scanLibrary } from './scan';
import { readMachineYaml } from './machineYaml';

const BRANDS = ['Royal', 'Continental'];

function root() {
  const r = mkdtempSync(path.join(tmpdir(), 'fs-scan-'));
  mkdirSync(path.join(r, 'Royal', '1948-Quiet-De-Luxe'), { recursive: true });
  writeFileSync(path.join(r, 'Royal', '1948-Quiet-De-Luxe', 'a.jpg'), 'x');
  return r;
}

describe('scanLibrary', () => {
  it('seeds machine.yaml from path inference and reports status "new"', () => {
    const r = root();
    const machines = scanLibrary(r, BRANDS);
    expect(machines).toHaveLength(1);
    const m = machines[0];
    expect(m.relPath).toBe('Royal/1948-Quiet-De-Luxe');
    expect(m.status).toBe('new');
    expect(m.machine.make).toBe('Royal');
    expect(m.machine.year).toBe('1948');
    expect(m.machine.model).toBe('Quiet De Luxe');
    expect(m.machine.photos.map((p) => p.file)).toEqual(['a.jpg']);
    expect(existsSync(path.join(m.absPath, 'machine.yaml'))).toBe(true);
  });

  it('does not overwrite an existing machine.yaml', () => {
    const r = root();
    scanLibrary(r, BRANDS); // seeds it
    const dir = path.join(r, 'Royal', '1948-Quiet-De-Luxe');
    writeFileSync(
      path.join(dir, 'machine.yaml'),
      'make: Royal\nmodel: Hand-Corrected\nyear: "1948"\nphotos:\n  - {file: a.jpg, role: gallery}\n',
    );
    const m = scanLibrary(r, BRANDS)[0];
    expect(m.machine.model).toBe('Hand-Corrected');
    void readMachineYaml; // (imported for parity; not otherwise needed)
  });
});
