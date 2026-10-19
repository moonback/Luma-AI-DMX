import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { safeStorage } from 'electron';
import type { SecretStore } from '../core/app/AppService';

/**
 * Secrets encrypted with the OS keychain via Electron safeStorage (DPAPI on Windows, Keychain on macOS,
 * libsecret on Linux). Never written in clear text: if encryption is unavailable, storing is refused.
 * The encrypted file is read once and kept in memory: `has` (polled by the runtime state) never touches the disk.
 */
export function createSecretStore(dir: string, onWarn: (message: string) => void = () => undefined): SecretStore {
  const file = path.join(dir, 'secrets.json');
  let cache: Record<string, string> | null = null;
  const read = (): Record<string, string> => {
    if (cache) return cache;
    try {
      cache = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
    } catch (err) {
      cache = {};
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        // Kept aside instead of being overwritten by the next `set`, which would lose the other secrets silently.
        try {
          renameSync(file, `${file}.corrupt`);
        } catch {
          // nothing more to save
        }
        onWarn('Fichier des secrets illisible (copie : secrets.json.corrupt) : ressaisissez la clé API');
      }
    }
    return cache;
  };
  return {
    has: (name) => !!read()[name],
    get(name) {
      const enc = read()[name];
      if (!enc || !safeStorage.isEncryptionAvailable()) return null;
      try {
        return safeStorage.decryptString(Buffer.from(enc, 'base64'));
      } catch {
        return null;
      }
    },
    set(name, value) {
      const all = { ...read() };
      if (value === null) delete all[name];
      else {
        if (!safeStorage.isEncryptionAvailable()) throw new Error('Chiffrement système indisponible : la clé n’a pas été enregistrée');
        all[name] = safeStorage.encryptString(value).toString('base64');
      }
      writeFileSync(`${file}.tmp`, JSON.stringify(all), { mode: 0o600 });
      renameSync(`${file}.tmp`, file);
      cache = all;
    },
  };
}
