import { afterEach, describe, expect, it, vi } from 'vitest';

/** The build's plain .mjs files (JSDoc types only), loaded fresh after the environment is set. */
async function load<T>(file: string): Promise<T> {
  return (await import(new URL(file, import.meta.url).href)) as T;
}

const { updatePublish: publish } = await load<{
  updatePublish: (address: string | undefined) => unknown;
}>('../update-feed.mjs');

describe('the update address (GYM_UPDATE_URL)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('none: no updates', () => {
    expect(publish(undefined)).toBeNull();
    expect(publish('  ')).toBeNull();
  });

  it('an HTTPS folder', () => {
    expect(publish('https://example.com/gym-spa/windows')).toEqual([
      { provider: 'generic', url: 'https://example.com/gym-spa/windows/' },
    ]);
  });

  it('plain HTTP only to this PC', () => {
    expect(publish('http://127.0.0.1:47290/')).toEqual([
      { provider: 'generic', url: 'http://127.0.0.1:47290/' },
    ]);
    expect(() => publish('http://example.com/')).toThrow('https://');
    expect(() => publish('ftp://example.com/')).toThrow('https://');
    expect(() => publish('https://user:pass@example.com/')).toThrow('login');
    expect(() => publish('not an address')).toThrow('not an address');
  });

  it('goes into the online installer, never into the offline one', async () => {
    vi.stubEnv('GYM_UPDATE_URL', 'https://example.com/updates/');
    const online = await load<{ default: { publish: unknown } }>('../electron-builder.config.mjs');
    const offline = await load<{ default: { publish: unknown } }>(
      '../electron-builder.offline.config.mjs',
    );
    expect(online.default.publish).toEqual([
      { provider: 'generic', url: 'https://example.com/updates/' },
    ]);
    expect(offline.default.publish).toBeNull();
  });
});
