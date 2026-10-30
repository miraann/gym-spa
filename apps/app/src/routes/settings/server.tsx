import { createFileRoute, redirect } from '@tanstack/react-router';
import { ServerPage } from '@/features/server/server-page';
import { isOfflineEdition } from '@/lib/edition';

export const Route = createFileRoute('/settings/server')({
  // The offline edition's server PC only: the online edition has no server of its own.
  beforeLoad: () => {
    if (!isOfflineEdition) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router's redirect
      throw redirect({ to: '/settings/display', replace: true });
    }
  },
  component: ServerPage,
});
