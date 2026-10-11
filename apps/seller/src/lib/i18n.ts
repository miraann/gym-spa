import { createSellerI18n } from '@gym/i18n/seller';
import { initReactI18next } from 'react-i18next';
import {
  applyToDocument,
  getPreferences,
  onSystemThemeChange,
  subscribePreferences,
} from './preferences';

export const i18n = createSellerI18n(getPreferences().language, [initReactI18next]);

/** Keeps i18next and <html lang/dir/class> in step with the saved preferences. */
export function startPreferenceSync(): void {
  const apply = (): void => {
    const preferences = getPreferences();
    if (i18n.language !== preferences.language) void i18n.changeLanguage(preferences.language);
    applyToDocument(preferences, i18n.getFixedT(preferences.language, 'seller')('app.name'));
  };
  apply();
  subscribePreferences(apply);
  onSystemThemeChange(apply);
}
