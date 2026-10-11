interface ImportMetaEnv {
  /** The gym app's backend (apps/app/.env*, the same Vercel env). */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
