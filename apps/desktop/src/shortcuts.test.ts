import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM_LEVEL,
  MIN_ZOOM_LEVEL,
  nextZoomLevel,
  shortcutFor,
  type KeyInput,
} from './shortcuts';

const key = (code: string, modifiers: Partial<KeyInput> = {}): KeyInput => ({
  type: 'keyDown',
  code,
  control: false,
  shift: false,
  alt: false,
  ...modifiers,
});

describe('shortcutFor', () => {
  it('zooms with Ctrl and the =/+, - and 0 keys, also on the number pad', () => {
    expect(shortcutFor(key('Equal', { control: true }), false)).toBe('zoom-in');
    // Ctrl+Shift+= is what "Ctrl and +" means on most layouts.
    expect(shortcutFor(key('Equal', { control: true, shift: true }), false)).toBe('zoom-in');
    expect(shortcutFor(key('NumpadAdd', { control: true }), false)).toBe('zoom-in');
    expect(shortcutFor(key('Minus', { control: true }), false)).toBe('zoom-out');
    expect(shortcutFor(key('NumpadSubtract', { control: true }), false)).toBe('zoom-out');
    expect(shortcutFor(key('Digit0', { control: true }), false)).toBe('zoom-reset');
    expect(shortcutFor(key('Numpad0', { control: true }), false)).toBe('zoom-reset');
  });

  it('toggles full screen with F11', () => {
    expect(shortcutFor(key('F11'), false)).toBe('toggle-fullscreen');
  });

  it('offers reload and DevTools only in development', () => {
    expect(shortcutFor(key('KeyR', { control: true }), false)).toBeUndefined();
    expect(shortcutFor(key('KeyI', { control: true, shift: true }), false)).toBeUndefined();
    expect(shortcutFor(key('F12'), false)).toBeUndefined();

    expect(shortcutFor(key('KeyR', { control: true }), true)).toBe('reload');
    expect(shortcutFor(key('KeyI', { control: true, shift: true }), true)).toBe('toggle-dev-tools');
    expect(shortcutFor(key('F12'), true)).toBe('toggle-dev-tools');
  });

  it('leaves everything else to the app (Ctrl+K search, typing, key releases, AltGr)', () => {
    expect(shortcutFor(key('KeyK', { control: true }), true)).toBeUndefined();
    expect(shortcutFor(key('Equal'), true)).toBeUndefined();
    expect(
      shortcutFor({ ...key('Equal', { control: true }), type: 'keyUp' }, true),
    ).toBeUndefined();
    // AltGr arrives as Ctrl+Alt on Windows; it types characters, it isn't a shortcut.
    expect(shortcutFor(key('Equal', { control: true, alt: true }), true)).toBeUndefined();
  });
});

describe('nextZoomLevel', () => {
  it('steps in and out', () => {
    expect(nextZoomLevel(0, 'zoom-in')).toBe(0.5);
    expect(nextZoomLevel(0, 'zoom-out')).toBe(-0.5);
  });

  it('stays within limits', () => {
    expect(nextZoomLevel(MAX_ZOOM_LEVEL, 'zoom-in')).toBe(MAX_ZOOM_LEVEL);
    expect(nextZoomLevel(MIN_ZOOM_LEVEL, 'zoom-out')).toBe(MIN_ZOOM_LEVEL);
  });
});
