import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scanLibrary } from './scan';

const MAKES = ['Royal', 'Continental'];
const MODELS: Record<string, string[]> = { Royal: ['Quiet De Luxe', 'Aristocrat'] };
const getModels = async (make: string) => MODELS[make] ?? [];

function root() {
  const r = mkdtempSync(path.join(tmpdir(), 'fs-scan-'));
  // Note the joined "Deluxe" spelling — fuzzy inference should still match "Quiet De Luxe".
  mkdirSync(path.join(r, 'Royal', '1948-Quiet-Deluxe'), { recursive: true });
  writeFileSync(path.join(r, 'Royal', '1948-Quiet-Deluxe', 'a.jpg'), 'x');
  return r;
}

describe('scanLibrary', () => {
  it('seeds machine.yaml from fuzzy make+model inference and reports status "new"', async () => {
    const r = root();
    const machines = await scanLibrary(r, MAKES, getModels);
    expect(machines).toHaveLength(1);
    const m = machines[0];
    expect(m.relPath).toBe('Royal/1948-Quiet-Deluxe');
    expect(m.status).toBe('new');
    expect(m.machine.make).toBe('Royal');
    expect(m.machine.year).toBe('1948');
    expect(m.machine.model).toBe('Quiet De Luxe');
    expect(m.machine.photos.map((p) => p.file)).toEqual(['a.jpg']);
    expect(existsSync(path.join(m.absPath, 'machine.yaml'))).toBe(true);
  });

  it('does not overwrite an existing machine.yaml', async () => {
    const r = root();
    await scanLibrary(r, MAKES, getModels); // seeds it
    const dir = path.join(r, 'Royal', '1948-Quiet-Deluxe');
    writeFileSync(
      path.join(dir, 'machine.yaml'),
      'make: Royal\nmodel: Hand-Corrected\nyear: "1948"\nphotos:\n  - {file: a.jpg, role: gallery}\n',
    );
    const m = (await scanLibrary(r, MAKES, getModels))[0];
    expect(m.machine.model).toBe('Hand-Corrected');
  });
});
