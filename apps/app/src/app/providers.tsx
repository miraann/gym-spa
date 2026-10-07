import { getDirection } from '@gym/i18n';
import type { CommonPowerSyncDatabase } from '@powersync/common';
import { PowerSyncContext } from '@powersync/react';
import type { ReactNode } from 'react';
import { DirectionProvider } from '@/components/ui/direction';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { usePreferences } from '@/lib/preferences';

interface AppProvidersProps {
  /** The local database; absent only when it failed to open (DatabaseError is shown then). */
  readonly database?: CommonPowerSyncDatabase;
  readonly children: ReactNode;
}

export function AppProviders({ database, children }: AppProvidersProps) {
  const { language, theme } = usePreferences();
  const direction = getDirection(language);

  return (
    // Radix components (menus, dialogs, sheets) read the direction from here.
    <DirectionProvider dir={direction}>
      <TooltipProvider delayDuration={400}>
        {database ? (
          <PowerSyncContext.Provider value={database}>{children}</PowerSyncContext.Provider>
        ) : (
          children
        )}
        <Toaster
          dir={direction}
          theme={theme}
          position={direction === 'rtl' ? 'bottom-left' : 'bottom-right'}
        />
      </TooltipProvider>
    </DirectionProvider>
  );
}
