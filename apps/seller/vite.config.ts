import { fileURLToPath, URL } from 'node:url';
import { contentSecurityPolicy } from '@gym/vite-plugins';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import ckb from '../../packages/i18n/src/locales/ckb/seller.json' with { type: 'json' };

// The seller panel: its own app and build, served at /seller/ of the gym app's domain (spec §2.6).
// The one Vercel build copies dist/ into the gym app's output under /seller/ (scripts/build-web.mjs).
// The backend values are the gym app's (same project, same Vercel env): read from apps/app.
const ENV_DIR = fileURLToPath(new URL('../app', import.meta.url));

/** Fills `%APP_NAME%` in index.html from the Kurdish translations, so no text is hardcoded there. */
function appNameInHtml(): Plugin {
  return {
    name: 'seller:app-name-in-html',
    transformIndexHtml: (html) => html.replaceAll('%APP_NAME%', ckb.app.name),
  };
}

export default defineConfig(({ mode }) => ({
  base: '/seller/',
  envDir: ENV_DIR,
  plugins: [
    react(),
    tailwindcss(),
    appNameInHtml(),
    // Stricter than the gym app's: no service worker, no manifest, no images from the server.
    contentSecurityPolicy(loadEnv(mode, ENV_DIR, 'VITE_'), {
      serviceWorker: false,
      manifest: false,
      serverImages: false,
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { port: 5174 },
  preview: { port: 4175 },
}));
