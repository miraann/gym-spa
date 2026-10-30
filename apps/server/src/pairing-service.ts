import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  normalizePairingCode,
  PAIRING_CODE_MINUTES,
  PAIRING_CODE_TRIES,
  pairingProof,
  serverIdentity,
} from '@gym/core';

// The PCs paired with this server (spec §8, step OF-d). The server screen makes a 6-digit code (one
// at a time, 10 minutes, 5 wrong tries); a PC that sends the right proof for it gets a random token,
// which it sends with every request from then on. Only the token's SHA-256 is kept here, in
// paired-pcs.json; removing a PC refuses its token at once.

export class PairingError extends Error {
  constructor(
    readonly key: 'no_code' | 'code_expired' | 'code_wrong' | 'too_many_tries' | 'invalid_name',
  ) {
    super(key);
  }
}

export interface PairedPc {
  readonly id: string;
  readonly name: string;
  readonly pairedAt: string;
  readonly lastSeenAt: string | null;
}

interface StoredPc extends PairedPc {
  readonly tokenHash: string;
}

export interface PairingCode {
  readonly code: string;
  readonly expiresAt: string;
  readonly identity: string;
}

export interface PairingService {
  readonly identity: string;
  newCode(): PairingCode;
  pair(input: { code: string; proof: string; name: string }): Promise<{
    token: string;
    pcId: string;
  }>;
  /** The paired PC a token belongs to, or null. */
  pcFor(token: string): PairedPc | null;
  list(): PairedPc[];
  remove(id: string): boolean;
  stop(): void;
}

/** Attempts from the whole LAN per minute: a code can't be tried by many PCs at once. */
const ATTEMPTS_PER_MINUTE = 20;
const SEEN_FLUSH_MS = 60_000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function readStored(file: string): StoredPc[] {
  if (!existsSync(file)) return [];
  try {
    const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (entry): entry is StoredPc =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as StoredPc).id === 'string' &&
        typeof (entry as StoredPc).name === 'string' &&
        typeof (entry as StoredPc).tokenHash === 'string' &&
        typeof (entry as StoredPc).pairedAt === 'string',
    );
  } catch {
    return [];
  }
}

export interface PairingOptions {
  readonly dataRoot: string;
  /** The server certificate's fingerprint (AB:CD:…). */
  readonly fingerprint: string;
  readonly log: (line: string) => void;
  readonly now?: () => number;
}

export function startPairingService(options: PairingOptions): PairingService {
  const file = path.join(options.dataRoot, 'paired-pcs.json');
  const now = options.now ?? (() => Date.now());
  let pcs = readStored(file);
  let current: { code: string; expiresAt: number; tries: number } | null = null;
  let attempts: number[] = [];
  let seenChanged = false;
  const save = () => {
    writeFileSync(file, JSON.stringify(pcs, null, 2));
  };
  const flush = setInterval(() => {
    if (!seenChanged) return;
    seenChanged = false;
    save();
  }, SEEN_FLUSH_MS);
  const visible = ({ id, name, pairedAt, lastSeenAt }: StoredPc): PairedPc => ({
    id,
    name,
    pairedAt,
    lastSeenAt,
  });

  return {
    identity: serverIdentity(options.fingerprint),
    newCode: () => {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const expiresAt = now() + PAIRING_CODE_MINUTES * 60_000;
      current = { code, expiresAt, tries: 0 };
      options.log('a new pairing code was made');
      return {
        code,
        expiresAt: new Date(expiresAt).toISOString(),
        identity: serverIdentity(options.fingerprint),
      };
    },
    pair: async (input) => {
      const moment = now();
      attempts = attempts.filter((at) => at > moment - 60_000);
      if (attempts.length >= ATTEMPTS_PER_MINUTE) throw new PairingError('too_many_tries');
      attempts.push(moment);
      const name = input.name.trim();
      if (name.length === 0 || name.length > 60) throw new PairingError('invalid_name');
      const code = current;
      if (code === null) throw new PairingError('no_code');
      if (moment > code.expiresAt) {
        current = null;
        throw new PairingError('code_expired');
      }
      const typed = normalizePairingCode(input.code);
      const expected = await pairingProof(code.code, options.fingerprint);
      if (typed !== code.code || !sameText(input.proof, expected)) {
        code.tries += 1;
        if (code.tries >= PAIRING_CODE_TRIES) current = null;
        throw new PairingError('code_wrong');
      }
      current = null;
      const token = randomBytes(32).toString('base64url');
      const pc: StoredPc = {
        id: randomUUID(),
        name,
        tokenHash: hashToken(token),
        pairedAt: new Date(moment).toISOString(),
        lastSeenAt: null,
      };
      pcs = [...pcs, pc];
      save();
      options.log(`PC paired: ${name}`);
      return { token, pcId: pc.id };
    },
    pcFor: (token) => {
      const hash = hashToken(token);
      const index = pcs.findIndex((pc) => sameText(pc.tokenHash, hash));
      const pc = pcs[index];
      if (pc === undefined) return null;
      const seen = new Date(now()).toISOString();
      // Written at most once a minute: every request comes through here.
      if (pc.lastSeenAt === null || Date.parse(seen) - Date.parse(pc.lastSeenAt) > SEEN_FLUSH_MS) {
        pcs = pcs.map((each, at) => (at === index ? { ...each, lastSeenAt: seen } : each));
        seenChanged = true;
      }
      return visible(pc);
    },
    list: () => pcs.map(visible),
    remove: (id) => {
      const before = pcs.length;
      pcs = pcs.filter((pc) => pc.id !== id);
      if (pcs.length === before) return false;
      save();
      options.log(`PC removed: ${id}`);
      return true;
    },
    stop: () => {
      clearInterval(flush);
      if (seenChanged) save();
    },
  };
}
