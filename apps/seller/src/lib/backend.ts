import type { Database } from '@gym/db';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type SellerClient = SupabaseClient<Database>;

/**
 * Where the panel keeps its session: sessionStorage, so closing the browser (or the tab) signs
 * out, under its own key, never shared with the gym app (same origin). Tests read this key.
 */
export const SESSION_STORAGE_KEY = 'gym-seller-auth';

// One variable at a time, so Vite puts only these two values into the bundle (see the gym app's
// lib/backend.ts; gym/no-import-meta-env-object forbids the whole object).
const URL_VALUE = import.meta.env.VITE_SUPABASE_URL?.trim();
const KEY_VALUE = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

/** The panel's Supabase client, or null in a build without a backend. */
export function createSellerClient(): SellerClient | null {
  if (!URL_VALUE || !KEY_VALUE) return null;
  return createClient<Database>(URL_VALUE, KEY_VALUE, {
    auth: {
      storage: window.sessionStorage,
      storageKey: SESSION_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}
