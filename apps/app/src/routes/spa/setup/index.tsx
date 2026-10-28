import { createFileRoute, redirect } from '@tanstack/react-router';

/** /spa/setup opens the services. */
export const Route = createFileRoute('/spa/setup/')({
  beforeLoad: () => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router's redirect
    throw redirect({ to: '/spa/setup/services', replace: true });
  },
});
