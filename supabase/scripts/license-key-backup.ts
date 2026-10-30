// The pieces of `pnpm license:new-key` and `pnpm license:restore-key` (license-key.ts) that can be
// tested without a terminal or the cloud: the encrypted backup file, the Supabase secrets API, and
// writing a public key into packages/core. The private key passes through here only in memory: it
// is never printed, logged, put on a command line or written to disk unencrypted.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from 'node:crypto';

export const SECRET_NAME = 'LICENSE_SIGNING_KEY';
export const BACKUP_FORMAT = 'gym-spa-license-key-backup';
export const BACKUP_EXTENSION = '.gskey';
/** A long password: the file may sit on a USB stick that gets lost. */
export const MIN_BACKUP_PASSWORD_LENGTH = 12;

/** scrypt with 128 MiB of memory: slow to guess on any hardware, under a second here. */
const KDF = { name: 'scrypt', N: 2 ** 17, r: 8, p: 1 } as const;
const MAX_MEMORY = 256 * 1024 * 1024;

/** What the backup file holds: the encrypted private key, and in clear what identifies it. */
export interface LicenseKeyBackup {
  readonly format: typeof BACKUP_FORMAT;
  readonly version: 1;
  readonly kid: string;
  /** The public half (not secret): to check a restore is the right key without the password. */
  readonly publicKey: string;
  readonly createdAt: string;
  readonly kdf: { name: 'scrypt'; N: number; r: number; p: number; salt: string };
  readonly cipher: { name: 'aes-256-gcm'; iv: string; tag: string };
  /** The private key JWK text, encrypted. */
  readonly data: string;
}

function derive(password: string, salt: Buffer, kdf: { N: number; r: number; p: number }): Buffer {
  return scryptSync(password.normalize('NFC'), salt, 32, { ...kdf, maxmem: MAX_MEMORY });
}

/** The clear fields are bound to the ciphertext: changing any of them makes decrypting fail. */
function associatedData(backup: Omit<LicenseKeyBackup, 'cipher' | 'data'>): Buffer {
  return Buffer.from(
    JSON.stringify([
      backup.format,
      backup.version,
      backup.kid,
      backup.publicKey,
      backup.createdAt,
      backup.kdf,
    ]),
  );
}

export function encryptBackup(
  privateJwk: string,
  { kid, publicKey }: { kid: string; publicKey: string },
  password: string,
  now: Date = new Date(),
): LicenseKeyBackup {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const header = {
    format: BACKUP_FORMAT,
    version: 1,
    kid,
    publicKey,
    createdAt: now.toISOString(),
    kdf: { ...KDF, salt: salt.toString('base64') },
  } as const;
  const cipher = createCipheriv('aes-256-gcm', derive(password, salt, KDF), iv);
  cipher.setAAD(associatedData(header));
  const data = Buffer.concat([cipher.update(privateJwk, 'utf8'), cipher.final()]);
  return {
    ...header,
    cipher: {
      name: 'aes-256-gcm',
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    },
    data: data.toString('base64'),
  };
}

export class BackupError extends Error {
  override readonly name = 'BackupError';
}

/** Reads a backup file's text; throws BackupError when it isn't one. */
export function parseBackup(text: string): LicenseKeyBackup {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new BackupError('This is not a license key backup file.');
  }
  const backup = value as Partial<LicenseKeyBackup> | null;
  if (
    backup?.format !== BACKUP_FORMAT ||
    backup.version !== 1 ||
    typeof backup.kid !== 'string' ||
    typeof backup.publicKey !== 'string' ||
    typeof backup.createdAt !== 'string' ||
    backup.kdf?.name !== 'scrypt' ||
    backup.cipher?.name !== 'aes-256-gcm' ||
    typeof backup.data !== 'string'
  ) {
    throw new BackupError('This is not a license key backup file.');
  }
  return backup as LicenseKeyBackup;
}

/** The private key JWK text; BackupError for a wrong password or a changed file (no difference). */
export function decryptBackup(backup: LicenseKeyBackup, password: string): string {
  try {
    const { kdf, cipher } = backup;
    const decipher = createDecipheriv(
      'aes-256-gcm',
      derive(password, Buffer.from(kdf.salt, 'base64'), kdf),
      Buffer.from(cipher.iv, 'base64'),
    );
    decipher.setAAD(associatedData(backup));
    decipher.setAuthTag(Buffer.from(cipher.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(backup.data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new BackupError('Wrong password, or the file was changed.');
  }
}

// The Supabase secrets API -------------------------------------------------------------------------
// `supabase secrets set` takes a secret only as a command-line argument or from a .env file on disk,
// so the scripts send it to the Management API straight from memory instead, over HTTPS.

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const API = 'https://api.supabase.com/v1';

export interface SecretsApi {
  /** The secret's names, and the value digest Supabase shows for each (SHA-256 hex), if any. */
  list(): Promise<{ name: string; value?: string }[]>;
  set(name: string, value: string): Promise<void>;
}

export class SecretsApiError extends Error {
  override readonly name = 'SecretsApiError';
}

/** Never puts the token or a value into an error message. */
export function secretsApi(
  projectRef: string,
  accessToken: string,
  fetcher: Fetch = fetch,
): SecretsApi {
  if (!/^[a-z0-9]{20}$/.test(projectRef)) throw new SecretsApiError('That is not a project ref.');
  const url = `${API}/projects/${projectRef}/secrets`;
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  return {
    async list() {
      const response = await fetcher(url, { headers });
      if (!response.ok) {
        await response.body?.cancel();
        throw new SecretsApiError(
          `Supabase refused to list the secrets (HTTP ${String(response.status)}).`,
        );
      }
      const body: unknown = await response.json();
      if (!Array.isArray(body)) throw new SecretsApiError('Unexpected answer listing the secrets.');
      return body.flatMap((entry: unknown) => {
        if (typeof entry !== 'object' || entry === null || !('name' in entry)) return [];
        const name = String(entry.name);
        return 'value' in entry && typeof entry.value === 'string'
          ? [{ name, value: entry.value }]
          : [{ name }];
      });
    },
    async set(name, value) {
      const response = await fetcher(url, {
        method: 'POST',
        headers,
        body: JSON.stringify([{ name, value }]),
      });
      await response.body?.cancel();
      if (!response.ok) {
        throw new SecretsApiError(
          `Supabase refused to set ${name} (HTTP ${String(response.status)}).`,
        );
      }
    },
  };
}

/**
 * Whether the secret arrived intact: Supabase lists a SHA-256 digest of each value. 'unknown' when
 * it lists none (then the deploy's first license shows it).
 */
export function secretDigestMatches(
  listed: string | undefined,
  value: string,
): 'yes' | 'no' | 'unknown' {
  if (listed === undefined || !/^[0-9a-f]{64}$/i.test(listed)) return 'unknown';
  return createHash('sha256').update(value).digest('hex') === listed.toLowerCase() ? 'yes' : 'no';
}

// The public key in the code ------------------------------------------------------------------------

const KEYS_PATTERN =
  /(export const LICENSE_PUBLIC_KEYS: Readonly<Record<string, string>> = \{)([\s\S]*?)(\};)/;

/** packages/core/src/license-keys.ts with this public key added (only public keys ever go there). */
export function withPublicKey(source: string, kid: string, publicKey: string): string {
  const match = KEYS_PATTERN.exec(source);
  if (!match) throw new Error('LICENSE_PUBLIC_KEYS was not found in license-keys.ts');
  const [, open = '', inner = '', close = ''] = match;
  if (inner.includes(`'${kid}'`)) throw new Error(`The kid ${kid} is already there`);
  const lines = inner.trim() === '' ? '\n' : inner.replace(/\s*$/, '\n');
  return source.replace(KEYS_PATTERN, `${open}${lines}  '${kid}': '${publicKey}',\n${close}`);
}
