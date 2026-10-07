// Fonts are bundled (never loaded from the internet) so Kurdish text renders offline.
import '@fontsource-variable/vazirmatn';
import '@fontsource-variable/inter';
import './styles.css';
import { platform } from '@gym/platform';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { startBackButtonHandling } from '@/app/back-button';
import { AppProviders } from '@/app/providers';
import { registerPwa } from '@/app/pwa';
import { DatabaseError } from '@/components/database-error';
import { startPreferenceSync } from '@/lib/i18n';
import { openAppDatabase } from '@/lib/local-database';
import { logError } from '@/lib/logger';
import { router } from '@/router';

startPreferenceSync();
startBackButtonHandling();
// The Android and Windows apps already carry every file, so only the web app needs the
// service worker (it would also show web-only "new version" prompts there).
if (platform === 'web') registerPwa();

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element in index.html');

// Everything works from the local database, so it opens before the first screen. Not a top-level
// await: the database chunk imports shared code from this entry module, and in the production
// build that would wait for this module to finish first, a deadlock.
async function start(root: HTMLElement) {
  const database = await openAppDatabase().catch((error: unknown) => {
    logError(error, { area: 'database' });
    return undefined;
  });

  createRoot(root).render(
    <StrictMode>
      <AppProviders database={database}>
        {database ? <RouterProvider router={router} /> : <DatabaseError />}
      </AppProviders>
    </StrictMode>,
  );
}

void start(container);
