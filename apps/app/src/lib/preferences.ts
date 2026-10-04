import { DEFAULT_LANGUAGE, isLanguage, type Digits, type Language } from '@gym/i18n';
import { useSyncExternalStore } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

/**
 * Display preferences of this device. In 1d the language also syncs with the staff profile
 * (order: staff preference → device default → Kurdish).
 */
export interface Preferences {
  readonly language: Language;
  readonly digits: Digits;
  readonly theme: ThemePreference;
}

/** The boot script in index.html reads this key too — keep both in sync. */
export const PREFERENCES_STORAGE_KEY = 'gym.preferences';

export const DEFAULT_PREFERENCES: Preferences = {
  language: DEFAULT_LANGUAGE,
  digits: 'latn',
  theme: 'system',
};

const THEMES: readonly ThemePreference[] = ['light', 'dark', 'system'];
const DIGIT_STYLES: readonly Digits[] = ['latn', 'arab'];

function pick<T extends string>(options: readonly T[], value: unknown, fallback: T): T {
  return options.find((option) => option === value) ?? fallback;
}

/** Reads saved preferences, falling back to defaults for anything missing or invalid. */
export function parsePreferences(raw: string | null): Preferences {
  if (!raw) return DEFAULT_PREFERENCES;
  let saved: unknown;
  try {
    saved = JSON.parse(raw);
  } catch {
    return DEFAULT_PREFERENCES;
  }
  if (typeof saved !== 'object' || saved === null) return DEFAULT_PREFERENCES;
  const record: Partial<Record<keyof Preferences, unknown>> = saved;
  return {
    language: isLanguage(record.language) ? record.language : DEFAULT_PREFERENCES.language,
    digits: pick(DIGIT_STYLES, record.digits, DEFAULT_PREFERENCES.digits),
    theme: pick(THEMES, record.theme, DEFAULT_PREFERENCES.theme),
  };
}

function readStored(): Preferences {
  try {
    return parsePreferences(localStorage.getItem(PREFERENCES_STORAGE_KEY));
  } catch {
    // Storage is blocked (e.g. a locked-down browser profile): use the defaults.
    return DEFAULT_PREFERENCES;
  }
}

let current = readStored();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function getPreferences(): Preferences {
  return current;
}

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
  if (current[key] === value) return;
  current = { ...current, [key]: value };
  try {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Storage is blocked: the choice still applies until the app is closed.
  }
  emit();
}

export function subscribePreferences(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Keep other open tabs and windows in step.
window.addEventListener('storage', (event) => {
  if (event.key !== PREFERENCES_STORAGE_KEY) return;
  current = parsePreferences(event.newValue);
  emit();
});

export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribePreferences, getPreferences);
}
