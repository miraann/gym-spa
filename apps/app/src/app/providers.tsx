import { getDirection } from '@gym/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { DirectionProvider } from '@/components/ui/direction';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { usePreferences } from '@/lib/preferences';

/** Data from the server, through TanStack Query. The connection monitor pauses it while offline. */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1 },
      mutations: { retry: 0 },
    },
  });
}

export function AppProviders({ children }: { readonly children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  const { language, theme } = usePreferences();
  const direction = getDirection(language);

  return (
    // Radix components (menus, dialogs, sheets) read the direction from here.
    <DirectionProvider dir={direction}>
      <TooltipProvider delayDuration={400}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        <Toaster
          dir={direction}
          theme={theme}
          position={direction === 'rtl' ? 'bottom-left' : 'bottom-right'}
        />
      </TooltipProvider>
    </DirectionProvider>
  );
}
