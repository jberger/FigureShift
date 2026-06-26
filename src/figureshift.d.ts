import type { ScannedMachine } from './main/scan';
import type { MachineDoc } from './main/machineYaml';

declare global {
  interface Window {
    figureshift: {
      login: (username: string, password: string) => Promise<{ ok: boolean; message?: string }>;
      resizeSmokeTest: () => Promise<{ ok: boolean; bytes: number; contentType: string; message?: string }>;
      pickRoot: () => Promise<string | null>;
      scan: (root: string) => Promise<ScannedMachine[]>;
      brands: () => Promise<string[]>;
      models: (make: string) => Promise<string[]>;
      saveMachine: (absPath: string, doc: MachineDoc) => Promise<{ ok: boolean }>;
    };
  }
}

export {};
