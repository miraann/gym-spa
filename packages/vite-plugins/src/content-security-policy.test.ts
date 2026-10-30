import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from './content-security-policy.ts';

/** The policy a build with these variables writes into index.html. */
function policyFor(env: Record<string, string>): string {
  const plugin = contentSecurityPolicy(env);
  const hook = plugin.transformIndexHtml as unknown as { handler: (html: string) => string };
  const html = hook.handler('<head><meta charset="UTF-8" /></head>');
  return /content="([^"]*)"/.exec(html)?.[1] ?? '';
}

describe('contentSecurityPolicy', () => {
  it('lets the online app reach its Supabase address only', () => {
    const policy = policyFor({ VITE_SUPABASE_URL: 'https://abc.supabase.co' });
    expect(policy).toContain("connect-src 'self' https://abc.supabase.co wss://abc.supabase.co;");
    expect(policy).toContain("img-src 'self' data: blob: https://abc.supabase.co;");
  });

  it("keeps the offline edition's own-origin server to 'self'", () => {
    const policy = policyFor({ VITE_SUPABASE_URL: 'app://gym-spa/server' });
    expect(policy).toContain("connect-src 'self';");
    expect(policy).toContain("img-src 'self' data: blob:;");
    expect(policy).not.toContain('null');
  });

  it('allows only itself without a backend address', () => {
    expect(policyFor({})).toContain("connect-src 'self';");
  });
});
