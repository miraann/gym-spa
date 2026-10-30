import { createFileRoute, redirect } from '@tanstack/react-router';
import { TemplatesPage } from '@/features/notifications/templates-page';
import { isOfflineEdition } from '@/lib/edition';

export const Route = createFileRoute('/settings/messages')({
  // Needs the internet: the offline edition has no such page.
  beforeLoad: () => {
    if (isOfflineEdition) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router's redirect
      throw redirect({ to: '/settings/display', replace: true });
    }
  },
  component: TemplatesPage,
});
