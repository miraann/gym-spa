import { afterEach, describe, expect, it, vi } from 'vitest';
import { clientAddress, readBackendConfig, STAND_IN_URL } from './backend';

const ADDRESS = 'https://project.supabase.co';
const KEY = 'sb_publishable_example';

describe('readBackendConfig', () => {
  it('reads the address and the publishable key', () => {
    expect(
      readBackendConfig({ VITE_SUPABASE_URL: ADDRESS, VITE_SUPABASE_PUBLISHABLE_KEY: KEY }),
    ).toEqual({ supabaseUrl: ADDRESS, supabaseKey: KEY });
  });

  it('ignores spaces around the values', () => {
    expect(
      readBackendConfig({
        VITE_SUPABASE_URL: ` ${ADDRESS}\n`,
        VITE_SUPABASE_PUBLISHABLE_KEY: ` ${KEY} `,
      }),
    ).toEqual({ supabaseUrl: ADDRESS, supabaseKey: KEY });
  });

  it.each([
    { VITE_SUPABASE_URL: ADDRESS },
    { VITE_SUPABASE_PUBLISHABLE_KEY: KEY },
    { VITE_SUPABASE_URL: '  ', VITE_SUPABASE_PUBLISHABLE_KEY: KEY },
    {},
  ])('is null for a build without a complete backend: %j', (env) => {
    expect(readBackendConfig(env)).toBeNull();
  });
});

describe('clientAddress', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('gives supabase-js an http(s) address as it is', () => {
    expect(clientAddress({ supabaseUrl: ADDRESS, supabaseKey: KEY })).toEqual({ url: ADDRESS });
  });

  it("puts the offline edition's app:// address behind a stand-in its fetch turns back", async () => {
    const seen: string[] = [];
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      seen.push(input instanceof Request ? input.url : String(input));
      return Promise.resolve(new Response('{}'));
    });
    const address = clientAddress({ supabaseUrl: 'app://gym-spa/server/', supabaseKey: KEY });
    expect(address.url).toBe(STAND_IN_URL);
    await address.fetch?.(`${STAND_IN_URL}/rest/v1/members?select=id`);
    await address.fetch?.(new URL(`${STAND_IN_URL}/auth/v1/token?grant_type=password`), {
      method: 'POST',
    });
    await address.fetch?.(new Request(`${STAND_IN_URL}/auth/v1/user`));
    expect(seen).toEqual([
      'app://gym-spa/server/rest/v1/members?select=id',
      'app://gym-spa/server/auth/v1/token?grant_type=password',
      'app://gym-spa/server/auth/v1/user',
    ]);
  });
});
