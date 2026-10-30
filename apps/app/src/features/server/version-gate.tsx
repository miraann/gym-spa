import { RefreshCwIcon, ServerCrashIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@gym/ui/components/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@gym/ui/components/empty';
import { isOfflineEdition } from '@/lib/edition';
import { sameVersion, useServerInfo } from './server-info';

/**
 * The offline edition's server and every PC must run the same version (spec §2.5): a PC with
 * another version shows why and does nothing else, so an old screen never writes to a newer
 * database (or the other way round). While the server can't be reached the app goes on as usual;
 * its connection indicator says so.
 */
export function VersionGate({ children }: { readonly children: ReactNode }) {
  const { t } = useTranslation();
  const server = useServerInfo();
  const appVersion = import.meta.env.VITE_APP_VERSION;
  if (!isOfflineEdition || !server.data || sameVersion(server.data, appVersion)) {
    return children;
  }
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <Empty className="max-w-xl" data-version-mismatch>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ServerCrashIcon />
          </EmptyMedia>
          <EmptyTitle>{t('serverVersion.title')}</EmptyTitle>
          <EmptyDescription>
            {t('serverVersion.text', { app: appVersion, server: server.data.version })}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            onClick={() => {
              void server.refetch();
            }}
            disabled={server.isFetching}
          >
            <RefreshCwIcon data-icon="inline-start" />
            {t('serverVersion.checkAgain')}
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}
