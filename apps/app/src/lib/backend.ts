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
  return createClient<Database>(config.supabaseUrl, config.supabaseKey, {
    auth: {
      storageKey: options.storageKey,
      persistSession: options.storage !== undefined,
      ...(options.storage ? { storage: options.storage } : {}),
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    // The audit log records which device made each change.
    global: { headers: { 'X-Device-Id': options.deviceId } },
  });
}
