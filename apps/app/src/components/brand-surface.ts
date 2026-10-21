import type { CSSProperties } from 'react';

/**
 * For a surface filled with the brand color (the login's brand panel, the dashboard's main tile):
 * the light mode's deep brand shade in dark mode too. The dark mode's own shade is light, made
 * for text and icons on a dark page, and looks washed out as a large fill.
 */
export const STRONG_BRAND_TOKENS = {
  '--primary': 'oklch(var(--brand-l) var(--brand-c) var(--brand-h))',
  '--primary-foreground': 'var(--brand-foreground)',
} as CSSProperties;
