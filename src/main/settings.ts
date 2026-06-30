import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse, parseDocument, Document } from 'yaml';

// App-wide settings, stored as human-editable YAML in the per-user app-data dir (NOT in the library):
//   macOS  ~/Library/Application Support/FigureShift/settings.yaml
//   Linux  ~/.config/FigureShift/settings.yaml
//   Win    %APPDATA%\FigureShift\settings.yaml
export interface Settings {
  libraryRoot?: string;
  // Future: makeAliases?: Record<string, string>; (user-defined aliases)
}

function settingsFile(): string {
  return path.join(app.getPath('userData'), 'settings.yaml');
}

export function readSettings(): Settings {
  const file = settingsFile();
  if (!existsSync(file)) return {};
  try {
    return (parse(readFileSync(file, 'utf8')) ?? {}) as Settings;
  } catch {
    return {};
  }
}

// Merge a patch, preserving any comments/formatting the user added by hand (like machine.yaml).
export function writeSettings(patch: Partial<Settings>): void {
  const file = settingsFile();
  const doc = existsSync(file) ? parseDocument(readFileSync(file, 'utf8')) : new Document({});
  for (const [k, v] of Object.entries(patch)) doc.set(k, v);
  try {
    writeFileSync(file, doc.toString());
  } catch {
    /* best-effort: settings are a convenience, never block the app */
  }
}

export function getLibraryRoot(): string {
  return readSettings().libraryRoot ?? '';
}
export function setLibraryRoot(root: string): void {
  writeSettings({ libraryRoot: root });
}
