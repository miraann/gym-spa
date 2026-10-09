import { describe, expect, it } from 'vitest';
import { readBackendConfig } from './backend';

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
