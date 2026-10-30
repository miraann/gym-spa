import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pairingProof, serverIdentity } from '@gym/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PairingError, startPairingService, type PairingService } from '../src/pairing-service.ts';

const FINGERPRINT = Array.from({ length: 32 }, (_, index) =>
  ((index * 7) % 256).toString(16).padStart(2, '0').toUpperCase(),
).join(':');
const OTHER = FINGERPRINT.replace(/^00/, 'FF');

let folder: string;
let time: number;
let service: PairingService;

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'gym-pairing-'));
  time = Date.parse('2026-10-30T10:00:00Z');
  service = startPairingService({
    dataRoot: folder,
    fingerprint: FINGERPRINT,
    log: () => undefined,
    now: () => time,
  });
});

afterEach(() => {
  service.stop();
  rmSync(folder, { recursive: true, force: true });
});

async function refused(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof PairingError) return error.key;
    throw error;
  }
  throw new Error('Not refused');
}

describe('pairing', () => {
  it('pairs a PC that proves the code for this certificate, once', async () => {
    const { code, identity, expiresAt } = service.newCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(identity).toBe(serverIdentity(FINGERPRINT));
    expect(expiresAt).toBe('2026-10-30T10:10:00.000Z');
    const paired = await service.pair({
      code,
      proof: await pairingProof(code, FINGERPRINT),
      name: 'کۆمپیوتەری پێشوازی',
    });
    expect(paired.token).toMatch(/^[\w-]{43}$/);
    expect(service.pcFor(paired.token)).toMatchObject({ name: 'کۆمپیوتەری پێشوازی' });
    // The code is used up.
    expect(
      await refused(
        service.pair({ code, proof: await pairingProof(code, FINGERPRINT), name: 'دووەم' }),
      ),
    ).toBe('no_code');
  });

  it('keeps only the token hash on disk', async () => {
    const { code } = service.newCode();
    const { token } = await service.pair({
      code,
      proof: await pairingProof(code, FINGERPRINT),
      name: 'کاشێر',
    });
    const stored = readFileSync(path.join(folder, 'paired-pcs.json'), 'utf8');
    expect(stored).not.toContain(token);
    expect(stored).toContain('کاشێر');
  });

  it('refuses a proof made for another certificate (someone in between)', async () => {
    const { code } = service.newCode();
    expect(
      await refused(service.pair({ code, proof: await pairingProof(code, OTHER), name: 'x' })),
    ).toBe('code_wrong');
  });

  it('drops a code after 5 wrong tries, or after 10 minutes', async () => {
    const { code } = service.newCode();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(
        await refused(
          service.pair({ code: wrong, proof: await pairingProof(wrong, FINGERPRINT), name: 'x' }),
        ),
      ).toBe('code_wrong');
    }
    expect(
      await refused(
        service.pair({ code, proof: await pairingProof(code, FINGERPRINT), name: 'x' }),
      ),
    ).toBe('no_code');

    const late = service.newCode();
    time += 10 * 60_000 + 1;
    expect(
      await refused(
        service.pair({
          code: late.code,
          proof: await pairingProof(late.code, FINGERPRINT),
          name: 'x',
        }),
      ),
    ).toBe('code_expired');
  });

  it('refuses more than 20 attempts a minute from the whole LAN', async () => {
    service.newCode();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await refused(service.pair({ code: '123456', proof: 'x', name: '' }));
    }
    expect(await refused(service.pair({ code: '123456', proof: 'x', name: 'x' }))).toBe(
      'too_many_tries',
    );
  });

  it('refuses a removed PC at once, and keeps the others after a restart', async () => {
    const first = service.newCode();
    const a = await service.pair({
      code: first.code,
      proof: await pairingProof(first.code, FINGERPRINT),
      name: 'یەکەم',
    });
    const second = service.newCode();
    const b = await service.pair({
      code: second.code,
      proof: await pairingProof(second.code, FINGERPRINT),
      name: 'دووەم',
    });
    expect(service.remove(a.pcId)).toBe(true);
    expect(service.pcFor(a.token)).toBeNull();
    expect(service.remove(a.pcId)).toBe(false);
    service.stop();
    const again = startPairingService({
      dataRoot: folder,
      fingerprint: FINGERPRINT,
      log: () => undefined,
    });
    expect(again.list().map((pc) => pc.name)).toEqual(['دووەم']);
    expect(again.pcFor(b.token)?.id).toBe(b.pcId);
    again.stop();
  });

  it('refuses a token it never gave', () => {
    expect(service.pcFor('not-a-token')).toBeNull();
  });
});
