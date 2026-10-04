// Fonts are bundled (never loaded from the internet) so Kurdish text renders offline.
import '@fontsource-variable/vazirmatn';
import '@fontsource-variable/inter';
import './styles.css';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProviders } from '@/app/providers';
import { registerPwa } from '@/app/pwa';
import { startPreferenceSync } from '@/lib/i18n';
import { router } from '@/router';

startPreferenceSync();
registerPwa();

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element in index.html');

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
