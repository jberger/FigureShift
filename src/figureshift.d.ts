import type { ScannedMachine } from './main/scan';
import type { MachineDoc } from './main/machineYaml';

declare global {
  interface Window {
    figureshift: {
      login: (username: string, password: string, remember: boolean) => Promise<{ ok: boolean; message?: string }>;
      autoLogin: () => Promise<{ ok: boolean; username: string }>;
      logout: () => Promise<void>;
      readPhoto: (args: { dir: string; file: string }) => Promise<{ ok: boolean; bytes?: Uint8Array; message?: string }>;
      saveEdit: (args: {
        dir: string;
        file: string;
        mode: 'overwrite' | 'new';
        bytes: Uint8Array;
      }) => Promise<{ ok: boolean; file?: string; message?: string }>;
      resizeSmokeTest: () => Promise<{ ok: boolean; bytes: number; contentType: string; message?: string }>;
      pickRoot: () => Promise<string | null>;
      scan: (root: string) => Promise<ScannedMachine[]>;
      brands: () => Promise<string[]>;
      models: (make: string) => Promise<string[]>;
      saveMachine: (absPath: string, doc: MachineDoc) => Promise<{ ok: boolean }>;
      push: (
        absPath: string,
      ) => Promise<{
        ok: boolean;
        created?: boolean;
        photosUploaded?: number;
        updated?: number;
        deleted?: number;
        url?: string;
        message?: string;
      }>;
      openExternal: (url: string) => Promise<void>;
    };
  }
}

export {};
