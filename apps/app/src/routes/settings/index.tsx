import { createFileRoute, redirect } from '@tanstack/react-router';

/** /settings opens the first settings page. */
export const Route = createFileRoute('/settings/')({
  beforeLoad: () => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router's redirect
    throw redirect({ to: '/settings/display', replace: true });
  },
});
