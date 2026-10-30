import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

// Shared by the Vite configs of the gym app (apps/app) and the seller panel (apps/seller), at
// build time only: nothing here reaches a bundle.

/**
 * The origin of a configured http(s) address. The offline edition's Windows build talks to
 * `app://gym-spa/server`, the page's own origin, which 'self' already allows (and whose URL origin
 * reads "null"), so it adds nothing.
 */
function serverOrigin(address: string | undefined): string | null {
  if (!address) return null;
  const url = new URL(address);
  return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
}

/** http(s) and the matching ws(s) origin of a configured address, for connect-src. */
function connectOrigins(address: string | undefined): string[] {
  const origin = serverOrigin(address);
  // https → wss, http → ws
  return origin === null ? [] : [origin, origin.replace(/^http/, 'ws')];
}

/**
 * Content-Security-Policy for production builds (web, Windows and Android share the build). The
 * app may only talk to its own origin and the configured Supabase server, and only
 * run its own scripts: the inline boot script in index.html is allowed by its hash. Dev mode has
 * none, because Vite injects its own inline scripts there.
 */
export interface ContentSecurityPolicyOptions {
  /** The app registers a service worker (the gym app's PWA). Default true. */
  readonly serviceWorker?: boolean;
  /** The app has a web manifest. Default true. */
  readonly manifest?: boolean;
  /** Images may come from the Supabase server (member photos) and blob: URLs. Default true. */
  readonly serverImages?: boolean;
}

export function contentSecurityPolicy(
  env: Record<string, string>,
  options: ContentSecurityPolicyOptions = {},
): Plugin {
  const { serviceWorker = true, manifest = true, serverImages = true } = options;
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
        const supabase = [serverOrigin(env.VITE_SUPABASE_URL)].filter((origin) => origin !== null);
        const policy = [
          "default-src 'self'",
          `script-src 'self' ${inlineScripts.join(' ')}`,
          serviceWorker ? "worker-src 'self'" : "worker-src 'none'",
          `connect-src 'self' ${servers.join(' ')}`,
          // Radix and sonner position things with inline styles.
          "style-src 'self' 'unsafe-inline'",
          serverImages
            ? `img-src 'self' data: blob: ${supabase.join(' ')}`
            : "img-src 'self' data:",
          "font-src 'self' data:",
          manifest ? "manifest-src 'self'" : "manifest-src 'none'",
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
