import { app, safeStorage } from 'electron';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const credFile = () => path.join(app.getPath('userData'), 'twdb-cred.bin');
const userFile = () => path.join(app.getPath('userData'), 'twdb-user.txt');

export function canRemember(): boolean {
  return safeStorage.isEncryptionAvailable();
}

// Store the password encrypted (OS-keychain-backed) + the username in plaintext beside it.
export function saveCredentials(username: string, password: string): void {
  if (!canRemember()) return;
  writeFileSync(credFile(), safeStorage.encryptString(password));
  writeFileSync(userFile(), username, 'utf8');
}

export function rememberedUsername(): string | null {
  try {
    return existsSync(userFile()) ? readFileSync(userFile(), 'utf8') : null;
  } catch {
    return null;
  }
}

export function loadCredentials(): { username: string; password: string } | null {
  try {
    if (!canRemember() || !existsSync(credFile()) || !existsSync(userFile())) return null;
    return {
      username: readFileSync(userFile(), 'utf8'),
      password: safeStorage.decryptString(readFileSync(credFile())),
    };
  } catch {
    return null;
  }
}

// Remove the stored password (e.g. it's stale/failed), keeping the username for pre-fill.
export function forgetPassword(): void {
  try {
    rmSync(credFile(), { force: true });
  } catch {
    /* ignore */
  }
}

// Full clear (explicit logout / "forget me").
export function clearCredentials(): void {
  forgetPassword();
  try {
    rmSync(userFile(), { force: true });
  } catch {
    /* ignore */
  }
}
