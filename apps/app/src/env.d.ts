interface ImportMetaEnv {
  /** Set from package.json at build time (vite.config.ts). */
  readonly VITE_APP_VERSION: string;
  /** See .env.example. Empty in a build without a backend: login then says it isn't set up. */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** `offline` in the offline edition's Windows build (`pnpm desktop:exe:offline`); otherwise unset. */
  readonly VITE_EDITION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
