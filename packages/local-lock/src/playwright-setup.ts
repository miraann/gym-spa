// Playwright's global setup in the apps' configs: a run started directly (the VS Code Playwright
// extension, `pnpm exec playwright test`) takes the local Supabase lock too. Inside `pnpm test:e2e`
// the script already holds it, and this goes on. The returned function is the global teardown.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireLocalLock } from './lock.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export default function globalSetup(config: { readonly configFile?: string }): () => void {
  const app = config.configFile ? path.relative(ROOT, path.dirname(config.configFile)) : 'an app';
  return acquireLocalLock(`playwright test (${app.replaceAll('\\', '/')})`);
}
