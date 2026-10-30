import type { Database } from '@gym/db';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface BackendConfig {
  readonly supabaseUrl: string;
  readonly supabaseKey: string;
}

/** The build values the backend address comes from. */
export type BackendEnv = Pick<ImportMetaEnv, 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_PUBLISHABLE_KEY'>;

// One variable at a time, so Vite puts only these two values into the bundle. Using
// import.meta.env as an object would publish every VITE_* variable of the build, Vercel's own
// included (git author, commit messages, project ids); gym/no-import-meta-env-object forbids it.
const BUILD_ENV: BackendEnv = {
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
};

/** The backend address from the build; null when a build has none. */
export function readBackendConfig(env: BackendEnv = BUILD_ENV): BackendConfig | null {
  const supabaseUrl = env.VITE_SUPABASE_URL?.trim();
  const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!supabaseUrl || !supabaseKey) return null;
  return { supabaseUrl, supabaseKey };
}

/**
 * supabase-js takes only http(s) addresses, but the offline edition's Windows build talks to
 * app://gym-spa/server (its own origin, forwarded by the Windows app to the server PC). Such an
 * address goes into supabase-js as this stand-in, and the client's fetch turns it back; the
 * stand-in itself is never fetched.
 */
export const STAND_IN_URL = 'http://server.gym-spa.invalid';

/** The address and fetch a supabase-js client is made with. */
export function clientAddress(config: BackendConfig): {
  readonly url: string;
  readonly fetch?: typeof fetch;
} {
  if (/^https?:\/\//i.test(config.supabaseUrl)) return { url: config.supabaseUrl };
  const base = config.supabaseUrl.replace(/\/+$/, '');
  const real = (address: string) =>
    address.startsWith(STAND_IN_URL) ? base + address.slice(STAND_IN_URL.length) : address;
  return {
    url: STAND_IN_URL,
    fetch: (input, init) => {
      if (input instanceof Request) return fetch(new Request(real(input.url), input), init);
      return fetch(real(input instanceof URL ? input.href : input), init);
    },
  };
}

export type AppSupabaseClient = SupabaseClient<Database>;

/** Where a client keeps its session (supabase-js' storage API). */
export interface ClientStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface ClientOptions {
  /** A unique key per staff member, so sessions (and supabase-js' locks) never mix. */
  readonly storageKey: string;
  /** Omit for a client that only keeps its session in memory. */
  readonly storage?: ClientStorage;
  readonly deviceId: string;
}

/**
 * A Supabase client for one staff member. Tokens are refreshed when needed rather than on a
 * timer: a device may hold several staff members' sessions, and most of them sit idle.
 */
export function createAppClient(config: BackendConfig, options: ClientOptions): AppSupabaseClient {
  const address = clientAddress(config);
  return createClient<Database>(address.url, config.supabaseKey, {
    auth: {
      storageKey: options.storageKey,
      persistSession: options.storage !== undefined,
      ...(options.storage ? { storage: options.storage } : {}),
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    // The audit log records which device made each change.
    global: {
      headers: { 'X-Device-Id': options.deviceId },
      ...(address.fetch ? { fetch: address.fetch } : {}),
    },
  });
}
