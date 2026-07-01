import { readdirSync } from 'node:fs';
import { isImageFile } from './library';
import { readMachineYaml } from './machineYaml';

export interface RescanResult {
  added: string[];   // image files on disk not yet in machine.yaml (sorted)
  missing: string[]; // machine.yaml photos whose file is gone from disk
}

// Report-only diff of a machine folder against its machine.yaml. Never writes:
// the renderer merges `added` into the in-memory doc and saves, so unsaved edits survive.
export function reconcileMachineDir(absPath: string): RescanResult {
  const onDisk = readdirSync(absPath, { withFileTypes: true })
    .filter((e) => e.isFile() && isImageFile(e.name))
    .map((e) => e.name);
  const diskSet = new Set(onDisk);
  const yamlFiles = readMachineYaml(absPath).photos.map((p) => p.file);
  const yamlSet = new Set(yamlFiles);
  const added = onDisk.filter((f) => !yamlSet.has(f)).sort();
  const missing = yamlFiles.filter((f) => !diskSet.has(f));
  return { added, missing };
}
