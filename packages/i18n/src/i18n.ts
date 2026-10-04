import i18next, { type i18n, type Module } from 'i18next';
import { DEFAULT_LANGUAGE, LANGUAGE_CODES, type Language } from './languages';
import { DEFAULT_NAMESPACE, NAMESPACES, resources } from './resources';

/**
 * Creates an i18next instance with every translation bundled in, so it works fully offline.
 * Missing translations fall back to Kurdish, the source language.
 */
export function createI18n(language: Language, plugins: readonly Module[] = []): i18n {
  const instance = i18next.createInstance();
  for (const plugin of plugins) {
    instance.use(plugin);
  }
  void instance.init({
    resources,
    lng: language,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: [...LANGUAGE_CODES],
    ns: [...NAMESPACES],
    defaultNS: DEFAULT_NAMESPACE,
    // React escapes rendered text. Escape values yourself if you build HTML strings (e.g. receipts).
    interpolation: { escapeValue: false },
    initAsync: false,
  });
  return instance;
}
