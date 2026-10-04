import { getDirection } from '@gym/i18n';
import type { ReactNode } from 'react';
import { DirectionProvider } from '@/components/ui/direction';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { usePreferences } from '@/lib/preferences';

export function AppProviders({ children }: { readonly children: ReactNode }) {
  const { language, theme } = usePreferences();
  const direction = getDirection(language);

  return (
    // Radix components (menus, dialogs, sheets) read the direction from here.
    <DirectionProvider dir={direction}>
      <TooltipProvider delayDuration={400}>
        {children}
        <Toaster
          dir={direction}
          theme={theme}
          position={direction === 'rtl' ? 'bottom-left' : 'bottom-right'}
        />
      </TooltipProvider>
    </DirectionProvider>
  );
}
