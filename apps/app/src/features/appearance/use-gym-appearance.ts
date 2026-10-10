import { APPEARANCE_SETTINGS, parseBrandColor, parseCornerStyle, parseLogo } from '@gym/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAuthController, useAuthState } from '@/features/auth/auth-context';
import { DEFAULT_GYM_LOOK, cachedLogoVersion, setGymLogo, setGymLook } from '@/lib/appearance';

/** Query keys, so the Appearance page can refresh them after saving. */
export const GYM_LOOK_QUERY = 'gym-look';
export const GYM_LOGO_VERSION_QUERY = 'gym-logo-version';

/** Other devices pick up a change on focus, or within this time (spec §6.1). */
const REFRESH_MS = 5 * 60_000;

/**
 * Keeps the gym's look on this device in step with the server: brand color and corners, and the
 * logo. The logo is large, so only its saved time is checked; the picture downloads when it changed.
 */
export function useGymAppearanceSync(): void {
  const controller = useAuthController();
  const { activeId, gym } = useAuthState();
  const client = activeId ? controller.activeClient : undefined;
  const gymId = gym?.id;

  const look = useQuery({
    queryKey: [GYM_LOOK_QUERY, gymId],
    enabled: client !== undefined,
    refetchInterval: REFRESH_MS,
    queryFn: async () => {
      if (!client) return null;
      const { data, error } = await client
        .from('settings')
        .select('key, value')
        .in('key', [APPEARANCE_SETTINGS.brandColor, APPEARANCE_SETTINGS.cornerStyle])
        .is('branch_id', null);
      if (error) throw error;
      const value = (key: string) => data.find((row) => row.key === key)?.value;
      return {
        brandColor:
          parseBrandColor(value(APPEARANCE_SETTINGS.brandColor)) ?? DEFAULT_GYM_LOOK.brandColor,
        cornerStyle:
          parseCornerStyle(value(APPEARANCE_SETTINGS.cornerStyle)) ?? DEFAULT_GYM_LOOK.cornerStyle,
      };
    },
  });
  useEffect(() => {
    if (look.data) setGymLook(look.data);
  }, [look.data]);

  const version = useQuery({
    queryKey: [GYM_LOGO_VERSION_QUERY, gymId],
    enabled: client !== undefined,
    refetchInterval: REFRESH_MS,
    queryFn: async (): Promise<string | null> => {
      if (!client) return null;
      const { data, error } = await client
        .from('settings')
        .select('updated_at')
        .eq('key', APPEARANCE_SETTINGS.logo)
        .is('branch_id', null)
        .maybeSingle();
      if (error) throw error;
      return data?.updated_at ?? null;
    },
  });
  const latest = version.data;
  const needsLogo = typeof latest === 'string' && latest !== cachedLogoVersion();

  const logo = useQuery({
    queryKey: ['gym-logo', gymId, latest],
    enabled: client !== undefined && needsLogo,
    staleTime: Infinity,
    queryFn: async () => {
      if (!client) return null;
      const { data, error } = await client
        .from('settings')
        .select('value, updated_at')
        .eq('key', APPEARANCE_SETTINGS.logo)
        .is('branch_id', null)
        .maybeSingle();
      if (error) throw error;
      const stored = data ? parseLogo(data.value) : null;
      return stored && data ? { ...stored, updatedAt: data.updated_at } : null;
    },
  });

  useEffect(() => {
    // No logo on the server (removed, or never added).
    if (latest === null) setGymLogo(null);
  }, [latest]);
  useEffect(() => {
    if (logo.data !== undefined) setGymLogo(logo.data);
  }, [logo.data]);
}
