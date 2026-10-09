import { createHash } from 'node:crypto';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import viteWasm from 'vite-plugin-wasm';
import ckb from '../../packages/i18n/src/locales/ckb/common.json' with { type: 'json' };
import pkg from './package.json' with { type: 'json' };

const THEME_COLOR = '#0f766e';

/** Fills `%APP_NAME%` in index.html from the Kurdish translations, so no text is hardcoded there. */
// vite-plugin-wasm has no return type.
const wasm: () => Plugin = viteWasm;

function appNameInHtml(): Plugin {
  return {
    name: 'gym:app-name-in-html',
    transformIndexHtml: (html) => html.replaceAll('%APP_NAME%', ckb.app.name),
  };
}

/** http(s) and the matching ws(s) origin of a configured address, for connect-src. */
function connectOrigins(address: string | undefined): string[] {
  if (!address) return [];
  const { origin } = new URL(address);
  // https → wss, http → ws
  return [origin, origin.replace(/^http/, 'ws')];
}

/**
 * Content-Security-Policy for production builds (web, Windows and Android share the build). The
 * app may only talk to its own origin and the configured Supabase and PowerSync servers, and only
 * run its own scripts: the inline boot script in index.html is allowed by its hash. Dev mode has
 * none, because Vite injects its own inline scripts there.
 */
function contentSecurityPolicy(env: Record<string, string>): Plugin {
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
        const servers = [
          ...connectOrigins(env.VITE_SUPABASE_URL),
          ...connectOrigins(env.VITE_POWERSYNC_URL),
        ];
        const supabase = env.VITE_SUPABASE_URL ? [new URL(env.VITE_SUPABASE_URL).origin] : [];
        const policy = [
          "default-src 'self'",
          // The local database is SQLite compiled to WebAssembly.
          `script-src 'self' 'wasm-unsafe-eval' ${inlineScripts.join(' ')}`,
          "worker-src 'self' blob:",
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

export default defineConfig(({ mode }) => ({
  plugins: [
    // The router plugin must run before the React plugin.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    appNameInHtml(),
    contentSecurityPolicy(loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), 'VITE_')),
    // The local database (PowerSync) is SQLite compiled to WebAssembly, run in web workers.
    wasm(),
    VitePWA({
      // Ask before reloading into a new version, so nobody loses a half-filled form.
      registerType: 'prompt',
      // Registered from React (see pwa-prompt.tsx).
      injectRegister: false,
      includeAssets: ['favicon.ico', 'logo.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        id: '/',
        name: ckb.app.fullName,
        short_name: ckb.app.name,
        description: ckb.app.description,
        lang: 'ckb',
        dir: 'rtl',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: THEME_COLOR,
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the whole app (code, fonts, icons, the SQLite WebAssembly) so it opens offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,ttf,wasm,webmanifest}'],
        // The encrypted-database builds of SQLite (mc-*) aren't used: keep 2.5 MB out of the first load.
        globIgnores: ['**/mc-wa-sqlite*.wasm'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
      },
    }),
  ],
  worker: {
    format: 'es',
    plugins: () => [wasm()],
  },
  optimizeDeps: {
    // They ship their own workers and WebAssembly, which pre-bundling would break.
    exclude: ['@journeyapps/wa-sqlite', '@powersync/web'],
  },
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
}));
