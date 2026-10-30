import { canLinkServer } from '@gym/platform';
import type { ReactNode } from 'react';
import { Spinner } from '@gym/ui/components/spinner';
import { isOfflineEdition } from '@/lib/edition';
import { ConnectScreen } from './connect-screen';
import { useServerInfo } from './server-info';
import { useServerLink } from './server-link';
import { SetupScreen } from './setup-screen';

// The offline edition's Windows app before anything else (step OF-d): a PC that isn't linked to
// the gym's server shows how to link it; the server PC itself shows its first setup (license,
// first Owner) until that is done. The online edition and other platforms go straight on.

export function ServerLinkGate({ children }: { readonly children: ReactNode }) {
  if (!isOfflineEdition || !canLinkServer()) return children;
  return <LinkedServer>{children}</LinkedServer>;
}

function LinkedServer({ children }: { readonly children: ReactNode }) {
  const link = useServerLink();
  if (link.isPending) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background">
        <Spinner className="size-8" />
      </main>
    );
  }
  const status = link.data ?? null;
  if (!status?.linked) {
    return (
      <ConnectScreen
        status={status ?? { linked: false, local: false, computerName: '' }}
        // The page starts again with the link in place (the app is locked then anyway).
        onLinked={() => {
          window.location.reload();
        }}
      />
    );
  }
  return status.local ? <ServerSetupGate>{children}</ServerSetupGate> : children;
}

/** The server PC's first setup, until the server has its license and first Owner. */
function ServerSetupGate({ children }: { readonly children: ReactNode }) {
  const info = useServerInfo();
  const setup = info.data?.setup ?? null;
  return setup === null ? children : <SetupScreen setup={setup} />;
}
