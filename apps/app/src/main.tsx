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
import { AuthProvider } from '@/features/auth/auth-provider';
import { AuthGate } from '@/features/auth/auth-gate';
import { startPreferenceSync } from '@/lib/i18n';
import { router } from '@/router';

startPreferenceSync();
startBackButtonHandling();
// The Android and Windows apps already carry every file, so only the web app needs the
// service worker (it would also show web-only "new version" prompts there).
if (platform === 'web') registerPwa();

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element in index.html');

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <AuthProvider>
        <AuthGate>
          <RouterProvider router={router} />
        </AuthGate>
      </AuthProvider>
    </AppProviders>
  </StrictMode>,
);
