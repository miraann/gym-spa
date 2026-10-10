import type { StaffAdminConfig } from './supabase-ports.ts';

/**
 * The Supabase address and keys from the environment. Supabase gives every Edge Function these
 * itself (nothing to set by hand): SUPABASE_URL, the API keys as JSON maps (SUPABASE_SECRET_KEYS,
 * SUPABASE_PUBLISHABLE_KEYS, {"default": "sb_..."}) and the older single keys
 * (SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY). gym-server sets the same names. null when
 * something is missing.
 */
export function readStaffAdminConfig(
  get: (name: string) => string | undefined,
): StaffAdminConfig | null {
  const url = get('SUPABASE_URL')?.trim();
  const secretKey =
    keyFromMap(get('SUPABASE_SECRET_KEYS')) ?? get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  const publishableKey =
    keyFromMap(get('SUPABASE_PUBLISHABLE_KEYS')) ?? get('SUPABASE_ANON_KEY')?.trim();
  if (!url || !secretKey || !publishableKey) return null;
  return { url, secretKey, publishableKey };
}

/** The "default" key of a JSON map of keys (or its only key). */
function keyFromMap(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  let keys: unknown;
  try {
    keys = JSON.parse(value);
  } catch {
    return undefined;
  }
  if (typeof keys !== 'object' || keys === null) return undefined;
  const entries = Object.entries(keys).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '',
  );
  const chosen =
    entries.find(([name]) => name === 'default') ?? (entries.length === 1 ? entries[0] : undefined);
  return chosen?.[1];
}
