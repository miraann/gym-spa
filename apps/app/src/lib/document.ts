import { getDirection } from '@gym/i18n';
import { applyNativeTheme } from '@gym/platform';
import { logError } from './logger';
import type { Preferences, ThemePreference } from './preferences';

const darkSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');

/**
 * The page background (--background in styles.css) as hex, for the browser's and the installed
 * PWA's title bar. index.html has the same values; test/theme.test.ts checks them.
 */
export const THEME_BAR_COLORS = { light: '#f5f5fa', dark: '#0e0f15' } as const;

export function resolveTheme(theme: ThemePreference): 'light' | 'dark' {
  if (theme === 'system') return darkSchemeQuery.matches ? 'dark' : 'light';
  return theme;
}

/**
 * Applies language, direction and theme to <html>, and the theme to the system bars or title bar
 * of the Android and Windows apps. The boot script in index.html mirrors the <html> part and the
 * title bar color.
 */
export function applyToDocument(preferences: Preferences, title: string): void {
  const root = document.documentElement;
  const theme = resolveTheme(preferences.theme);
  root.lang = preferences.language;
  root.dir = getDirection(preferences.language);
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
  // Both tags (one per device scheme) get the chosen theme, so a dark choice on a light device
  // gets a dark bar too.
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', THEME_BAR_COLORS[theme]);
  }
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
