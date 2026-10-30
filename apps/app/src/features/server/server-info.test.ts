import { describe, expect, it, vi } from 'vitest';
import { editionOf } from '@/lib/edition';
import { fetchServerInfo, readOnlyReason, sameVersion, type LicenseSummary } from './server-info';

const INFO = {
  edition: 'offline',
  version: '0.1.0',
  fingerprint: 'AB:CD',
  gym: { code: 'hawler-fit', name: 'جیمی هەولێر' },
  license: {
    kind: 'activated',
    gymCode: 'hawler-fit',
    type: 'yearly',
    expiresOn: '2027-10-29',
    updatesUntil: null,
    maxBranches: 2,
    maxDevices: 6,
    state: { kind: 'active', daysLeft: 10, stage: 30 },
    updates: { kind: 'none' },
    clockBehind: false,
  },
};

const config = { supabaseUrl: 'app://gym-spa/server/', supabaseKey: 'sb_publishable_x' };

describe('fetchServerInfo', () => {
  it("reads the server's answer", async () => {
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(INFO)));
    await expect(fetchServerInfo(config, fetcher)).resolves.toEqual(INFO);
    expect(fetcher.mock.calls[0]?.[0]).toBe('app://gym-spa/server/server/v1/info');
  });

  it('refuses an answer it does not know, and a server error', async () => {
    const odd = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({ ...INFO, edition: 'online' })),
    );
    await expect(fetchServerInfo(config, odd)).rejects.toThrow();
    const down = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 502 })));
    await expect(fetchServerInfo(config, down)).rejects.toThrow('server_info_502');
  });

  it('takes a server without a gym or license yet', async () => {
    const fresh = { ...INFO, gym: null, license: null };
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(fresh)));
    await expect(fetchServerInfo(config, fetcher)).resolves.toEqual(fresh);
  });
});

describe('the edition and the version', () => {
  it('is offline only when the build says so', () => {
    expect(editionOf('offline')).toBe('offline');
    expect(editionOf(undefined)).toBe('online');
    expect(editionOf('Offline')).toBe('online');
  });

  it('needs exactly the same version on the PC and the server', () => {
    expect(sameVersion({ version: '0.1.0' }, '0.1.0')).toBe(true);
    expect(sameVersion({ version: '0.1.1' }, '0.1.0')).toBe(false);
  });
});

describe('readOnlyReason', () => {
  const license = INFO.license as LicenseSummary;

  it('names why an offline gym is read-only', () => {
    expect(readOnlyReason({ ...license, clockBehind: true })).toBe('clock');
    expect(readOnlyReason({ ...license, kind: 'not_activated' })).toBe('notActivated');
    expect(readOnlyReason({ ...license, kind: 'wrong_machine' })).toBe('wrongMachine');
    expect(readOnlyReason({ ...license, kind: 'broken' })).toBe('broken');
  });

  it('leaves an ended license and the online edition to the usual words', () => {
    expect(readOnlyReason(license)).toBeNull();
    expect(readOnlyReason(null)).toBeNull();
  });
});
