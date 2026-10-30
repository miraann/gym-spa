import { createFileRoute, redirect } from '@tanstack/react-router';
import { SupportPage } from '@/features/support/support-page';
import { isOfflineEdition } from '@/lib/edition';

export const Route = createFileRoute('/settings/support')({
  // Needs the internet: the offline edition has no such page.
  beforeLoad: () => {
    if (isOfflineEdition) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router's redirect
      throw redirect({ to: '/settings/display', replace: true });
    }
  },
  component: SupportPage,
});
