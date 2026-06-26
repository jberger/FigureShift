import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseDocument, Document, parse } from 'yaml';

export type PhotoRole = 'cover' | 'typeSample' | 'gallery' | 'skip';

export interface MachinePhoto {
  file: string;
  role: PhotoRole;
  caption?: string;
}

export interface MachineDoc {
  make?: string;
  model?: string;
  year?: string;
  serialNo?: string;
  description?: string;
  photos: MachinePhoto[];
}

export interface TwdbPhotoState {
  twdbPhotoId?: string;
  twdbPhotoUrl?: string;
  hash?: string;
}

export interface TwdbDoc {
  twdbUrl?: string;
  galleryId?: string;
  photos: Record<string, TwdbPhotoState>;
  lastPushedAt?: string;
}

const MACHINE = 'machine.yaml';
const TWDB = 'machine.twdb.yaml';

export function readMachineYaml(dir: string): MachineDoc {
  const file = path.join(dir, MACHINE);
  if (!existsSync(file)) return { photos: [] };
  const doc = (parse(readFileSync(file, 'utf8')) ?? {}) as Partial<MachineDoc>;
  return { ...doc, photos: doc.photos ?? [] };
}

// Rewrite machine.yaml, preserving existing comments/formatting by editing the
// parsed Document in place rather than re-serializing from scratch.
export function writeMachineYaml(dir: string, machine: MachineDoc): void {
  const file = path.join(dir, MACHINE);
  const doc = existsSync(file) ? parseDocument(readFileSync(file, 'utf8')) : new Document({});
  for (const [k, v] of Object.entries(machine)) doc.set(k, v);
  writeFileSync(file, doc.toString());
}

export function readTwdbYaml(dir: string): TwdbDoc {
  const file = path.join(dir, TWDB);
  if (!existsSync(file)) return { photos: {} };
  const doc = (parse(readFileSync(file, 'utf8')) ?? {}) as Partial<TwdbDoc>;
  return { ...doc, photos: doc.photos ?? {} };
}

// The app owns this file entirely, so a clean re-serialize is fine (no user comments here).
export function writeTwdbYaml(dir: string, state: TwdbDoc): void {
  const doc = new Document(state);
  writeFileSync(path.join(dir, TWDB), doc.toString());
}
