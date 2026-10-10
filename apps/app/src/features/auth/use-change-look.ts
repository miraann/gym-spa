import type { TextSize, ThemePreference } from '@gym/core';
import { useCallback } from 'react';
import { logError } from '@/lib/logger';
import { setPreference } from '@/lib/preferences';
import { useAuthController } from './auth-context';

/**
 * Light / dark / follow the device. Applies at once; while a staff member is using the app it is
 * also saved on their profile, so it follows them to other devices (spec §6.1).
 */
export function useChangeTheme(): (theme: ThemePreference) => void {
  const controller = useAuthController();
  return useCallback(
    (theme: ThemePreference) => {
      setPreference('theme', theme);
      controller.saveLook({ theme }).catch((error: unknown) => {
        logError(error, { area: 'auth', action: 'save-theme' });
      });
    },
    [controller],
  );
}

/** Normal or large text, the same way as the theme. */
export function useChangeTextSize(): (textSize: TextSize) => void {
  const controller = useAuthController();
  return useCallback(
    (textSize: TextSize) => {
      setPreference('textSize', textSize);
      controller.saveLook({ textSize }).catch((error: unknown) => {
        logError(error, { area: 'auth', action: 'save-text-size' });
      });
    },
    [controller],
  );
}
