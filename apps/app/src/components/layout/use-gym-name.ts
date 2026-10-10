import { localizedName } from '@gym/i18n';
import { useDeviceGym } from '@/features/auth/auth-context';
import { usePreferences } from '@/lib/preferences';

/** The name of the device's gym in the current language; null before the first login. */
export function useGymName(): string | null {
  const gym = useDeviceGym();
  const { language } = usePreferences();
  return gym ? localizedName(gym, language) : null;
}
