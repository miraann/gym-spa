import { getDirection } from '@gym/i18n';
import { applyNativeTheme } from '@gym/platform';
import { logError } from './logger';
import type { Preferences, ThemePreference } from './preferences';

const darkSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');

export function resolveTheme(theme: ThemePreference): 'light' | 'dark' {
  if (theme === 'system') return darkSchemeQuery.matches ? 'dark' : 'light';
  return theme;
}

/**
 * Applies language, direction and theme to <html>, and the theme to the system bars or title bar
 * of the Android and Windows apps. The boot script in index.html mirrors the <html> part.
 */
export function applyToDocument(preferences: Preferences, title: string): void {
  const root = document.documentElement;
  const theme = resolveTheme(preferences.theme);
  root.lang = preferences.language;
  root.dir = getDirection(preferences.language);
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
  document.title = title;
  applyNativeTheme(preferences.theme).catch((error: unknown) => {
    logError(error, { area: 'native-theme' });
  });
}

export function onSystemThemeChange(listener: () => void): () => void {
  darkSchemeQuery.addEventListener('change', listener);
  return () => {
    darkSchemeQuery.removeEventListener('change', listener);
  };
}
