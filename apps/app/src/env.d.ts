interface ImportMetaEnv {
  /** Set from package.json at build time (vite.config.ts). */
  readonly VITE_APP_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
