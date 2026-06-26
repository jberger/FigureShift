import { existsSync } from 'node:fs';
import path from 'node:path';
import { inferMachineFromPath } from '@joelberger/twdb-client';
import { findMachineDirs } from './library';
import { readMachineYaml, writeMachineYaml, readTwdbYaml, type MachineDoc } from './machineYaml';

export type MachineStatus = 'new' | 'onTwdb';

export interface ScannedMachine {
  absPath: string;
  relPath: string;
  status: MachineStatus;
  machine: MachineDoc;
}

// Detect machine folders; for any without a machine.yaml, seed one from path inference.
// Never overwrites an existing machine.yaml (the user's edits win).
export function scanLibrary(root: string, brandNames: string[]): ScannedMachine[] {
  return findMachineDirs(root).map((dir) => {
    const machineFile = path.join(dir.absPath, 'machine.yaml');
    if (!existsSync(machineFile)) {
      const { brandGuess, modelGuess, yearGuess } = inferMachineFromPath(dir.relPath, brandNames);
      const seeded: MachineDoc = {
        make: brandGuess || undefined,
        model: modelGuess || undefined,
        year: yearGuess || undefined,
        photos: dir.imageFiles.map((file) => ({ file, role: 'gallery' as const })),
      };
      writeMachineYaml(dir.absPath, seeded);
    }
    const machine = readMachineYaml(dir.absPath);
    const twdb = readTwdbYaml(dir.absPath);
    return {
      absPath: dir.absPath,
      relPath: dir.relPath,
      status: twdb.twdbUrl ? 'onTwdb' : 'new',
      machine,
    };
  });
}
