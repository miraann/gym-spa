/**
 * Whether the screen takes touch: a coarse pointer, or any touch points at all. Some touch screens
 * report a fine pointer (the Android emulator's WebView, touch laptops); a mouse alone has none.
 */
export function hasTouchScreen(): boolean {
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}
