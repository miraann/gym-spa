import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { contentSecurityPolicy } from '@gym/vite-plugins';
import ckb from '../../packages/i18n/src/locales/ckb/common.json' with { type: 'json' };
import pkg from './package.json' with { type: 'json' };

// The default brand color (--primary in styles.css, indigo-violet); test/theme.test.ts checks it.
const THEME_COLOR = '#4f46e5';

/** Fills `%APP_NAME%` in index.html from the Kurdish translations, so no text is hardcoded there. */
function appNameInHtml(): Plugin {
  return {
    name: 'gym:app-name-in-html',
    transformIndexHtml: (html) => html.replaceAll('%APP_NAME%', ckb.app.name),
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
        background_color: '#f5f5fa',
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
        // Precache the whole app (code, fonts, icons), so it opens fast. Data always needs the server.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,ttf,webmanifest}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
      },
    }),
  ],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
}));
