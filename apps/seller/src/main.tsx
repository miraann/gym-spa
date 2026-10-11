// Fonts are bundled (never loaded from the internet).
import '@gym/ui/fonts';
import './styles.css';
import { Toaster } from '@gym/ui/components/sonner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { toast } from 'sonner';
import { App, NotConfigured } from '@/app';
import { SessionProvider } from '@/auth/session';
import { createSellerClient } from '@/lib/backend';
import { SellerClientContext } from '@/lib/client';
import type { PanelErrorKey } from '@/lib/errors';
import { i18n, startPreferenceSync } from '@/lib/i18n';

startPreferenceSync();

const client = createSellerClient();
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: true },
  },
});

function Root() {
  const onError = useCallback((key: PanelErrorKey) => {
    toast.error(i18n.t(`seller:errors.${key}`));
  }, []);
  if (client === null) return <NotConfigured />;
  return (
    <SellerClientContext.Provider value={client}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider onError={onError}>
          <App />
        </SessionProvider>
      </QueryClientProvider>
    </SellerClientContext.Provider>
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <Root />
        <Toaster />
      </I18nextProvider>
    </StrictMode>,
  );
}
