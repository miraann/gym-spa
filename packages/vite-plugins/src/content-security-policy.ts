import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

// Shared by the Vite configs of the gym app (apps/app) and the seller panel (apps/seller), at
// build time only: nothing here reaches a bundle.

/** http(s) and the matching ws(s) origin of a configured address, for connect-src. */
function connectOrigins(address: string | undefined): string[] {
  if (!address) return [];
  const { origin } = new URL(address);
  // https → wss, http → ws
  return [origin, origin.replace(/^http/, 'ws')];
}

/**
 * Content-Security-Policy for production builds (web, Windows and Android share the build). The
 * app may only talk to its own origin and the configured Supabase server, and only
 * run its own scripts: the inline boot script in index.html is allowed by its hash. Dev mode has
 * none, because Vite injects its own inline scripts there.
 */
export function contentSecurityPolicy(env: Record<string, string>): Plugin {
  return {
    name: 'gym:content-security-policy',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
          (match) =>
            `'sha256-${createHash('sha256')
              .update(match[1] ?? '')
              .digest('base64')}'`,
        );
        const servers = connectOrigins(env.VITE_SUPABASE_URL);
        const supabase = env.VITE_SUPABASE_URL ? [new URL(env.VITE_SUPABASE_URL).origin] : [];
        const policy = [
          "default-src 'self'",
          `script-src 'self' ${inlineScripts.join(' ')}`,
          "worker-src 'self'",
          `connect-src 'self' ${servers.join(' ')}`,
          // Radix and sonner position things with inline styles.
          "style-src 'self' 'unsafe-inline'",
          `img-src 'self' data: blob: ${supabase.join(' ')}`,
          "font-src 'self' data:",
          "manifest-src 'self'",
          "object-src 'none'",
          "frame-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ]
          .map((directive) => directive.trim())
          .join('; ');
        return html.replace(
          '<meta charset="UTF-8" />',
          `<meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
        );
      },
    },
  };
}
