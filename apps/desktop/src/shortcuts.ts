/** Keyboard shortcuts of the Windows app. The app has no menu bar, so these are its only ones. */
export type Shortcut =
  'zoom-in' | 'zoom-out' | 'zoom-reset' | 'toggle-fullscreen' | 'reload' | 'toggle-dev-tools';

/** The parts of Electron's `before-input-event` input that shortcuts depend on. */
export interface KeyInput {
  readonly type: string;
  readonly code: string;
  readonly control: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
}

/**
 * Maps a key press to a shortcut. Uses physical keys (`code`), so the shortcuts also work with a
 * Kurdish or Arabic keyboard layout. Reload and DevTools exist only in development.
 */
export function shortcutFor(input: KeyInput, isDevelopment: boolean): Shortcut | undefined {
  if (input.type !== 'keyDown' || input.alt) return undefined;

  if (input.control) {
    switch (input.code) {
      case 'Equal':
      case 'NumpadAdd':
        return 'zoom-in';
      case 'Minus':
      case 'NumpadSubtract':
        return 'zoom-out';
      case 'Digit0':
      case 'Numpad0':
        return 'zoom-reset';
      case 'KeyR':
        return isDevelopment && !input.shift ? 'reload' : undefined;
      case 'KeyI':
        return isDevelopment && input.shift ? 'toggle-dev-tools' : undefined;
      default:
        return undefined;
    }
  }

  if (input.code === 'F11') return 'toggle-fullscreen';
  if (input.code === 'F12' && isDevelopment) return 'toggle-dev-tools';
  return undefined;
}

/** Zoom steps match Chromium's (each step is 20%), from about 50% to 300%. */
export const ZOOM_STEP = 0.5;
export const MIN_ZOOM_LEVEL = -3.5;
export const MAX_ZOOM_LEVEL = 6;

export function nextZoomLevel(current: number, shortcut: 'zoom-in' | 'zoom-out'): number {
  const next = current + (shortcut === 'zoom-in' ? ZOOM_STEP : -ZOOM_STEP);
  return Math.min(MAX_ZOOM_LEVEL, Math.max(MIN_ZOOM_LEVEL, next));
}
