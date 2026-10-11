import { THEME_PREFERENCES, type ThemePreference } from '@gym/core';
import { DEFAULT_LANGUAGE, getDirection, isLanguage, type Language } from '@gym/i18n';
import { useSyncExternalStore } from 'react';

/**
 * The panel's display preferences on this browser: language and light/dark. Its own storage key,
 * never the gym app's (the two share an origin). The boot script in index.html reads it too.
 */
export interface Preferences {
  readonly language: Language;
  readonly theme: ThemePreference;
}

export const PREFERENCES_STORAGE_KEY = 'seller.preferences';

const DEFAULTS: Preferences = { language: DEFAULT_LANGUAGE, theme: 'system' };

export function parsePreferences(raw: string | null): Preferences {
  let saved: unknown;
  try {
    saved = raw ? JSON.parse(raw) : null;
  } catch {
    return DEFAULTS;
  }
  if (typeof saved !== 'object' || saved === null) return DEFAULTS;
  const record: Partial<Record<keyof Preferences, unknown>> = saved;
  return {
    language: isLanguage(record.language) ? record.language : DEFAULTS.language,
    theme: THEME_PREFERENCES.find((theme) => theme === record.theme) ?? DEFAULTS.theme,
  };
}

function readStored(): Preferences {
  try {
    return parsePreferences(localStorage.getItem(PREFERENCES_STORAGE_KEY));
  } catch {
    return DEFAULTS;
  }
}

let current = readStored();
const listeners = new Set<() => void>();
const darkScheme = window.matchMedia('(prefers-color-scheme: dark)');

export function getPreferences(): Preferences {
  return current;
}

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
  if (current[key] === value) return;
  current = { ...current, [key]: value };
  try {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Storage is blocked: the choice still applies until the page is closed.
  }
  for (const listener of listeners) listener();
}

export function subscribePreferences(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribePreferences, getPreferences);
}

/** Language, direction and theme on <html>, as the boot script in index.html does. */
export function applyToDocument(preferences: Preferences, title: string): void {
  const root = document.documentElement;
  const dark =
    preferences.theme === 'dark' || (preferences.theme === 'system' && darkScheme.matches);
  root.lang = preferences.language;
  root.dir = getDirection(preferences.language);
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  document.title = title;
}

export function onSystemThemeChange(listener: () => void): void {
  darkScheme.addEventListener('change', listener);
}
