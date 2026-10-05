import { describe, expect, it } from 'vitest';
import { drawsBehindSystemBars } from './theme';

const androidWebView = (version: string) =>
  `Mozilla/5.0 (Linux; Android 14; SM-T220 Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/${version} Mobile Safari/537.36`;

describe('drawsBehindSystemBars', () => {
  it('is false on WebViews older than 140, which Capacitor pads instead', () => {
    expect(drawsBehindSystemBars(androidWebView('113.0.5672.136'))).toBe(false);
    expect(drawsBehindSystemBars(androidWebView('139.0.7258.94'))).toBe(false);
  });

  it('is true from WebView 140', () => {
    expect(drawsBehindSystemBars(androidWebView('140.0.7339.51'))).toBe(true);
    expect(drawsBehindSystemBars(androidWebView('152.0.7600.10'))).toBe(true);
  });

  it('is false when the version is unknown', () => {
    expect(drawsBehindSystemBars('Mozilla/5.0 (Linux; Android 14)')).toBe(false);
  });
});
