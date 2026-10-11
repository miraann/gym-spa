// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The web deployment (one Vercel project) serves the gym app and, under /seller/, the seller panel
 * (spec §2.6, decided 2026-10-11). Vercel applies these rules only when deployed, so the file
 * itself is checked here; the panel's e2e tests check the build.
 */
interface Rule {
  readonly source: string;
  readonly destination?: string;
  readonly headers?: readonly { readonly key: string; readonly value: string }[];
}

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
  buildCommand: string;
  rewrites: Rule[];
  headers: Rule[];
};

/** Whether a Vercel source pattern (a path-to-regexp with a regex group) matches a path. */
function matches(source: string, path: string): boolean {
  return new RegExp(`^${source}$`).test(path);
}

function headersFor(path: string): Map<string, string> {
  const result = new Map<string, string>();
  // Later rules win for the same header.
  for (const rule of config.headers) {
    if (matches(rule.source, path))
      for (const { key, value } of rule.headers ?? []) result.set(key, value);
  }
  return result;
}

function rewriteOf(path: string): string | undefined {
  return config.rewrites.find((rule) => matches(rule.source, path))?.destination;
}

describe('vercel.json', () => {
  it('builds both apps and copies the panel in', () => {
    expect(config.buildCommand).toBe('pnpm build:web');
  });

  it("sends the panel's pages to its own index.html, and the gym app's to its own", () => {
    expect(rewriteOf('/seller/')).toBe('/seller/index.html');
    expect(rewriteOf('/seller/gyms/123')).toBe('/seller/index.html');
    expect(rewriteOf('/settings/display')).toBe('/index.html');
    expect(rewriteOf('/seller/assets/index.js')).toBeUndefined();
    expect(rewriteOf('/assets/index.js')).toBeUndefined();
  });

  it("gives the panel's pages their own strict headers", () => {
    const headers = headersFor('/seller/gyms');
    expect(headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(headers.get('Cache-Control')).toBe('no-store');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('never stores the panel page, but keeps its hashed files', () => {
    expect(headersFor('/seller/').get('Cache-Control')).toBe('no-store');
    expect(headersFor('/seller/index.html').get('Cache-Control')).toBe('no-store');
    expect(headersFor('/seller/assets/index-abc.js').get('Cache-Control')).toContain('immutable');
  });

  it("leaves the gym app's headers as they were", () => {
    const headers = headersFor('/');
    expect(headers.get('X-Robots-Tag')).toBeUndefined();
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });
});
