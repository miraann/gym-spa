import type { Language } from '@gym/i18n';
import { useCallback } from 'react';
import { logError } from '@/lib/logger';
import { setPreference } from '@/lib/preferences';
import { useAuthController } from './auth-context';

/**
 * Switches the app's language. While a staff member is using the app it is also saved on their
 * profile, so it follows them to other devices (staff preference → device default → Kurdish).
 */
export function useChangeLanguage(): (language: Language) => void {
  const controller = useAuthController();
  return useCallback(
    (language: Language) => {
      setPreference('language', language);
      controller.saveLanguage(language).catch((error: unknown) => {
        logError(error, { area: 'auth', action: 'save-language' });
      });
    },
    [controller],
  );
}
