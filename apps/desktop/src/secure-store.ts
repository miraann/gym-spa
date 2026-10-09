import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isSecureKey, SECURE_VALUE_MAX_LENGTH } from '@gym/platform/desktop-bridge';

/** How values are encrypted: Electron's safeStorage (Windows DPAPI, tied to the Windows user). */
export interface Cipher {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

/**
 * Staff sessions and PIN hashes for the web app, one encrypted file per key in `folder`. Keys and
 * values come from the web page, so both are checked here.
 */
export function createSecureStore(folder: string, cipher: Cipher) {
  function fileFor(key: unknown): string {
    if (!isSecureKey(key)) throw new Error('Invalid secure storage key');
    return path.join(folder, `${key}.bin`);
  }

  function requireEncryption(): void {
    // Never fall back to storing secrets in plain text.
    if (!cipher.isEncryptionAvailable()) throw new Error('Encryption is not available');
  }

  return {
    async get(key: unknown): Promise<string | null> {
      const file = fileFor(key);
      requireEncryption();
      let encrypted: Buffer;
      try {
        encrypted = await readFile(file);
      } catch {
        return null;
      }
      return cipher.decryptString(encrypted);
    },

    async set(key: unknown, value: unknown): Promise<void> {
      const file = fileFor(key);
      if (typeof value !== 'string' || value.length > SECURE_VALUE_MAX_LENGTH) {
        throw new Error('Invalid secure storage value');
      }
      requireEncryption();
      await mkdir(folder, { recursive: true });
      // Write then rename, so a crash never leaves half a file behind.
      const temporary = `${file}.tmp`;
      await writeFile(temporary, cipher.encryptString(value));
      await rename(temporary, file);
    },

    async delete(key: unknown): Promise<void> {
      await rm(fileFor(key), { force: true });
    },
  };
}
