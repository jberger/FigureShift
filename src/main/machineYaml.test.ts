import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  readMachineYaml, writeMachineYaml, readTwdbYaml, writeTwdbYaml, type MachineDoc,
} from './machineYaml';

function tmp() { return mkdtempSync(path.join(tmpdir(), 'fs-yaml-')); }

describe('machineYaml', () => {
  it('writes and reads back a machine.yaml round-trip', () => {
    const dir = tmp();
    const doc: MachineDoc = {
      make: 'Continental', model: 'Klein', year: '1932', serialNo: '12345',
      description: 'A lovely machine',
      photos: [{ file: 'a.jpg', role: 'cover', caption: 'front' }],
    };
    writeMachineYaml(dir, doc);
    expect(existsSync(path.join(dir, 'machine.yaml'))).toBe(true);
    expect(readMachineYaml(dir)).toEqual(doc);
  });

  it('preserves user comments when rewriting machine.yaml', () => {
    const dir = tmp();
    writeFileSync(
      path.join(dir, 'machine.yaml'),
      'make: Royal\n# user note: verify the year\nyear: "1948"\nphotos: []\n',
    );
    const doc = readMachineYaml(dir);
    doc.model = 'Quiet De Luxe';
    writeMachineYaml(dir, doc);
    const text = readFileSync(path.join(dir, 'machine.yaml'), 'utf8');
    expect(text).toContain('# user note: verify the year');
    expect(text).toContain('Quiet De Luxe');
  });

  it('reads a missing twdb file as empty state and round-trips', () => {
    const dir = tmp();
    expect(readTwdbYaml(dir)).toEqual({ photos: {} });
    writeTwdbYaml(dir, { twdbUrl: 'x.123.typewriter', galleryId: '123', photos: {}, lastPushedAt: '2026-06-25' });
    expect(readTwdbYaml(dir).galleryId).toBe('123');
  });
});
