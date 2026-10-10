import {
  CORNER_RADIUS,
  DEFAULT_BRAND_COLOR,
  DEFAULT_CORNER_STYLE,
  TEXT_SCALE,
  brandVariables,
  logoDataUrl,
  parseBrandColor,
  parseCornerStyle,
  parseLogo,
  type BrandColor,
  type CornerStyle,
  type StoredLogo,
  type TextSize,
} from '@gym/core';
import { useSyncExternalStore } from 'react';

/**
 * The gym's look on this device (spec §6.1): applied as CSS variables, so a change shows at once,
 * and cached so the next start, the login and the lock screens already have it. The boot script
 * in index.html applies the cached variables before the first paint; keep the keys in sync.
 */
export interface GymLook {
  readonly brandColor: BrandColor;
  readonly cornerStyle: CornerStyle;
}

export const DEFAULT_GYM_LOOK: GymLook = {
  brandColor: DEFAULT_BRAND_COLOR,
  cornerStyle: DEFAULT_CORNER_STYLE,
};

export const GYM_LOOK_STORAGE_KEY = 'gym.look';
export const GYM_LOGO_STORAGE_KEY = 'gym.logo';

/** The cached logo, with the time it was saved on the server (to know when it changed). */
export interface CachedLogo extends StoredLogo {
  readonly updatedAt: string;
}

/** The CSS variables of a look (the brand's shades and the corner radius). */
export function lookVariables(look: GymLook): Record<string, string> {
  return { ...brandVariables(look.brandColor), '--radius': CORNER_RADIUS[look.cornerStyle] };
}

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is blocked or full: the look still applies until the app is closed.
  }
}

/** Reads a cached look, falling back to the default for anything missing or invalid. */
export function parseGymLook(value: unknown): GymLook {
  if (typeof value !== 'object' || value === null) return DEFAULT_GYM_LOOK;
  const record: Partial<Record<keyof GymLook, unknown>> = value;
  return {
    brandColor: parseBrandColor(record.brandColor) ?? DEFAULT_GYM_LOOK.brandColor,
    cornerStyle: parseCornerStyle(record.cornerStyle) ?? DEFAULT_GYM_LOOK.cornerStyle,
  };
}

function parseCachedLogo(value: unknown): CachedLogo | null {
  const logo = parseLogo(value);
  if (!logo || typeof value !== 'object' || value === null) return null;
  const { updatedAt } = value as { updatedAt?: unknown };
  return typeof updatedAt === 'string' ? { ...logo, updatedAt } : null;
}

let look = parseGymLook(read(GYM_LOOK_STORAGE_KEY));
let logo = parseCachedLogo(read(GYM_LOGO_STORAGE_KEY));
/** The logo as a data: URL, made once per logo. */
let logoUrl = logo ? logoDataUrl(logo) : null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function applyVariables(variables: Record<string, string>): void {
  const { style } = document.documentElement;
  for (const [name, value] of Object.entries(variables)) style.setProperty(name, value);
}

/** Shows a look without saving it (the Appearance page's live preview). */
export function previewGymLook(preview: GymLook): void {
  applyVariables(lookVariables(preview));
}

/** Back to the gym's saved look, after a preview. */
export function restoreGymLook(): void {
  applyVariables(lookVariables(look));
}

/** The gym's look from the server: applied and cached for the next start. */
export function setGymLook(next: GymLook): void {
  applyVariables(lookVariables(next));
  if (next.brandColor === look.brandColor && next.cornerStyle === look.cornerStyle) return;
  look = next;
  // The boot script can't do the color math, so the variables are cached too.
  write(GYM_LOOK_STORAGE_KEY, { ...next, variables: lookVariables(next) });
  emit();
}

export function getGymLook(): GymLook {
  return look;
}

export function useGymLook(): GymLook {
  return useSyncExternalStore(subscribe, getGymLook);
}

/** The gym's logo from the server (null: none). */
export function setGymLogo(next: CachedLogo | null): void {
  if ((next?.updatedAt ?? null) === (logo?.updatedAt ?? null)) return;
  logo = next;
  logoUrl = next ? logoDataUrl(next) : null;
  write(GYM_LOGO_STORAGE_KEY, next);
  emit();
}

/** When the cached logo was saved on the server; null without a logo. */
export function cachedLogoVersion(): string | null {
  return logo?.updatedAt ?? null;
}

function getLogoUrl(): string | null {
  return logoUrl;
}

/** The gym's logo as an image URL, or null. */
export function useGymLogo(): string | null {
  return useSyncExternalStore(subscribe, getLogoUrl);
}

/** "Use another gym": the next gym's look starts from the default. */
export function clearGymAppearance(): void {
  setGymLook(DEFAULT_GYM_LOOK);
  write(GYM_LOOK_STORAGE_KEY, null);
  setGymLogo(null);
}

/** Text size: every size is in rem, so the root size scales text, spacing and targets together. */
export function applyTextSize(size: TextSize): void {
  document.documentElement.style.fontSize = TEXT_SCALE[size];
}
