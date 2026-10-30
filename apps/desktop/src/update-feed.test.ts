import { afterEach, describe, expect, it, vi } from 'vitest';

/** The build's plain .mjs files (JSDoc types only), loaded fresh after the environment is set. */
async function load<T>(file: string): Promise<T> {
  return (await import(new URL(file, import.meta.url).href)) as T;
}

const {
  updatePublish: publish,
  updateAddress,
  OFFICIAL_UPDATE_URL,
} = await load<{
  updatePublish: (address: string | undefined) => unknown;
  updateAddress: (variable: string | undefined) => string | undefined;
  OFFICIAL_UPDATE_URL: string;
}>('../update-feed.mjs');

describe('the update address (GYM_UPDATE_URL)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('the releases repository by default; off: none', () => {
    expect(OFFICIAL_UPDATE_URL).toBe(
      'https://github.com/miraann/gym-spa-releases/releases/latest/download/',
    );
    expect(updateAddress(undefined)).toBe(OFFICIAL_UPDATE_URL);
    expect(updateAddress('')).toBe(OFFICIAL_UPDATE_URL);
    expect(updateAddress('off')).toBeUndefined();
    expect(updateAddress('https://example.com/u/')).toBe('https://example.com/u/');
  });

  it('no address: no updates', () => {
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

  it('the online installer gets the releases repository; the offline one never an address', async () => {
    vi.stubEnv('GYM_UPDATE_URL', '');
    const official = await load<{ default: { publish: unknown } }>(
      '../electron-builder.config.mjs',
    );
    expect(official.default.publish).toEqual([{ provider: 'generic', url: OFFICIAL_UPDATE_URL }]);
  });

  it('another address goes into the online installer, never into the offline one', async () => {
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

describe('publishing a version (pnpm desktop:publish)', () => {
  it('reads what latest.yml announces, and names the installer', async () => {
    const { parseLatestYml, installerName } = await load<{
      parseLatestYml: (text: string) => { version: string; file: string; sha512: string };
      installerName: (version: string) => string;
    }>('../scripts/publish-update.mjs');
    const latest = [
      'version: 0.2.0',
      'files:',
      '  - url: gym-spa-setup-0.2.0.exe',
      '    sha512: abc==',
      '    size: 1',
      'path: gym-spa-setup-0.2.0.exe',
      'sha512: abc==',
    ].join('\n');
    expect(parseLatestYml(latest)).toEqual({
      version: '0.2.0',
      file: 'gym-spa-setup-0.2.0.exe',
      sha512: 'abc==',
    });
    expect(installerName('0.2.0')).toBe('gym-spa-setup-0.2.0.exe');
    expect(() => parseLatestYml('version: 1.0.0')).toThrow('latest.yml');
  });
});
