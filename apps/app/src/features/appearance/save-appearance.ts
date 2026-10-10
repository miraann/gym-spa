import { APPEARANCE_SETTINGS, type StoredLogo } from '@gym/core';
import type { AppSupabaseClient } from '@/lib/backend';
import type { GymLook } from '@/lib/appearance';

/** The unique key of a setting row; gym_id comes from the session (its column default). */
const ON_CONFLICT = 'gym_id,branch_id,key';

/**
 * Saves the gym's brand color and corners as gym-wide settings, both in one statement, so they
 * change together or not at all. RLS allows it with settings.edit and access to all branches.
 */
export async function saveGymLook(client: AppSupabaseClient, look: GymLook): Promise<void> {
  const { error } = await client.from('settings').upsert(
    [
      { key: APPEARANCE_SETTINGS.brandColor, value: look.brandColor },
      { key: APPEARANCE_SETTINGS.cornerStyle, value: look.cornerStyle },
    ],
    { onConflict: ON_CONFLICT },
  );
  if (error) throw error;
}

/** Saves the gym's logo; returns when it was saved (the version other devices compare). */
export async function saveLogo(client: AppSupabaseClient, logo: StoredLogo): Promise<string> {
  const { data, error } = await client
    .from('settings')
    .upsert(
      { key: APPEARANCE_SETTINGS.logo, value: { type: logo.type, data: logo.data } },
      { onConflict: ON_CONFLICT },
    )
    .select('updated_at')
    .single();
  if (error) throw error;
  return data.updated_at;
}

/** Removes the gym's logo: its name is shown instead. */
export async function removeLogo(client: AppSupabaseClient): Promise<void> {
  const { error } = await client
    .from('settings')
    .delete()
    .eq('key', APPEARANCE_SETTINGS.logo)
    .is('branch_id', null);
  if (error) throw error;
}
