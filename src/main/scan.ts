import { existsSync } from 'node:fs';
import path from 'node:path';
import { inferMake, inferModel, suggestTwdbYear } from '@joelberger/twdb-client';
import { findMachineDirs } from './library';
import { readMachineYaml, writeMachineYaml, readTwdbYaml, type MachineDoc } from './machineYaml';

export type MachineStatus = 'new' | 'onTwdb';

export interface ScannedMachine {
  absPath: string;
  relPath: string;
  status: MachineStatus;
  machine: MachineDoc;
}

// Detect machine folders; for any without a machine.yaml, seed one from fuzzy path inference:
// match a make from the path, fetch that make's models via `getModels`, then match a model among
// them, and infer the year. Never overwrites an existing machine.yaml (the user's edits win).
export async function scanLibrary(
  root: string,
  makeNames: string[],
  getModels: (make: string) => Promise<string[]>,
): Promise<ScannedMachine[]> {
  const out: ScannedMachine[] = [];
  for (const dir of findMachineDirs(root)) {
    const machineFile = path.join(dir.absPath, 'machine.yaml');
    if (!existsSync(machineFile)) {
      const make = inferMake(dir.relPath, makeNames);
      const model = make ? inferModel(dir.relPath, await getModels(make)) : '';
      const seeded: MachineDoc = {
        make: make || undefined,
        model: model || undefined,
        year: suggestTwdbYear(dir.relPath) || undefined,
        photos: dir.imageFiles.map((file) => ({ file, role: 'gallery' as const })),
      };
      writeMachineYaml(dir.absPath, seeded);
    }
    const machine = readMachineYaml(dir.absPath);
    const twdb = readTwdbYaml(dir.absPath);
    out.push({
      absPath: dir.absPath,
      relPath: dir.relPath,
      status: twdb.twdbUrl ? 'onTwdb' : 'new',
      machine,
    });
  }
  return out;
}
