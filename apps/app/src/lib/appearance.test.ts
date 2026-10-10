import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_GYM_LOOK,
  GYM_LOGO_STORAGE_KEY,
  GYM_LOOK_STORAGE_KEY,
  applyTextSize,
  cachedLogoVersion,
  clearGymAppearance,
  getGymLook,
  parseGymLook,
  previewGymLook,
  restoreGymLook,
  setGymLogo,
  setGymLook,
} from './appearance';

const root = document.documentElement;
const variable = (name: string) => root.style.getPropertyValue(name);

afterEach(() => {
  restoreGymLook();
  clearGymAppearance();
  root.removeAttribute('style');
});

describe('the gym look', () => {
  it('applies the brand and corners as CSS variables and caches them for the boot script', () => {
    setGymLook({ brandColor: 'blue', cornerStyle: 'sharp' });

    expect(variable('--brand-h')).toBe('256');
    expect(variable('--radius')).toBe('0.25rem');
    const cached = JSON.parse(localStorage.getItem(GYM_LOOK_STORAGE_KEY) ?? '{}') as {
      brandColor: string;
      variables: Record<string, string>;
    };
    expect(cached.brandColor).toBe('blue');
    expect(cached.variables['--radius']).toBe('0.25rem');
  });

  it('previews without saving, and goes back', () => {
    setGymLook({ brandColor: 'purple', cornerStyle: 'soft' });
    previewGymLook({ brandColor: '#0f766e', cornerStyle: 'medium' });
    expect(variable('--radius')).toBe('0.625rem');
    expect(getGymLook().brandColor).toBe('purple');

    restoreGymLook();
    expect(variable('--radius')).toBe('1rem');
    expect(variable('--brand-h')).toBe('303');
  });

  it('keeps the preview on screen when the saved look refreshes from the server', () => {
    previewGymLook({ brandColor: 'blue', cornerStyle: 'soft' });
    setGymLook({ brandColor: 'gray', cornerStyle: 'sharp' });
    expect(variable('--brand-h')).toBe('256');
    expect(getGymLook().brandColor).toBe('gray');

    restoreGymLook();
    expect(variable('--brand-h')).toBe('265');
    expect(variable('--radius')).toBe('0.25rem');
  });

  it('reads a broken cache as the default look', () => {
    expect(parseGymLook(null)).toEqual(DEFAULT_GYM_LOOK);
    expect(parseGymLook({ brandColor: '#FFF', cornerStyle: 'round' })).toEqual(DEFAULT_GYM_LOOK);
    expect(parseGymLook({ brandColor: '#2563eb', cornerStyle: 'medium' })).toEqual({
      brandColor: '#2563eb',
      cornerStyle: 'medium',
    });
  });

  it('forgets the look and logo for another gym', () => {
    setGymLook({ brandColor: 'gray', cornerStyle: 'sharp' });
    setGymLogo({ type: 'image/png', data: 'iVBORw0KGgo=', updatedAt: '2026-10-10T12:00:00Z' });
    clearGymAppearance();

    expect(getGymLook()).toEqual(DEFAULT_GYM_LOOK);
    expect(cachedLogoVersion()).toBeNull();
    expect(localStorage.getItem(GYM_LOOK_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(GYM_LOGO_STORAGE_KEY)).toBeNull();
  });
});

describe('applyTextSize', () => {
  it('scales the root font size, so every rem grows', () => {
    applyTextSize('large');
    expect(root.style.fontSize).toBe('112.5%');
    applyTextSize('normal');
    expect(root.style.fontSize).toBe('100%');
  });
});
