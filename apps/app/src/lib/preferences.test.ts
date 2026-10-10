import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFERENCES, parsePreferences, PREFERENCES_STORAGE_KEY } from './preferences';

describe('parsePreferences', () => {
  it('defaults to Kurdish, Western digits and the device theme', () => {
    expect(parsePreferences(null)).toEqual({
      language: 'ckb',
      digits: 'latn',
      theme: 'system',
      textSize: 'normal',
    });
  });

  it('reads valid saved values', () => {
    expect(
      parsePreferences('{"language":"ar","digits":"arab","theme":"dark","textSize":"large"}'),
    ).toEqual({
      language: 'ar',
      digits: 'arab',
      theme: 'dark',
      textSize: 'large',
    });
  });

  it('replaces invalid or unknown values with defaults', () => {
    expect(parsePreferences('{"language":"fr","digits":7,"theme":"neon","textSize":9}')).toEqual(
      DEFAULT_PREFERENCES,
    );
    expect(parsePreferences('{"language":"en"}')).toEqual({
      ...DEFAULT_PREFERENCES,
      language: 'en',
    });
  });

  it('survives corrupted storage', () => {
    expect(parsePreferences('{not json')).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences('"ckb"')).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences('null')).toEqual(DEFAULT_PREFERENCES);
  });
});

describe('preference store', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('saves a change and notifies subscribers', async () => {
    const store = await import('./preferences');
    const listener = vi.fn();
    store.subscribePreferences(listener);

    store.setPreference('language', 'en');

    expect(store.getPreferences().language).toBe('en');
    expect(listener).toHaveBeenCalledOnce();
    expect(JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? '{}')).toMatchObject({
      language: 'en',
    });
  });

  it('ignores a change to the same value', async () => {
    const store = await import('./preferences');
    const listener = vi.fn();
    store.subscribePreferences(listener);

    store.setPreference('language', 'ckb');

    expect(listener).not.toHaveBeenCalled();
  });

  it('loads what an earlier session saved', async () => {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, '{"language":"ar","digits":"arab"}');
    const store = await import('./preferences');

    expect(store.getPreferences()).toEqual({
      language: 'ar',
      digits: 'arab',
      theme: 'system',
      textSize: 'normal',
    });
  });
});
