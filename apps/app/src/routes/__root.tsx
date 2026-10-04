import { createRootRoute } from '@tanstack/react-router';
import { ErrorScreen, NotFoundScreen } from '@/components/error-screen';
import { AppShell } from '@/components/layout/app-shell';

export const Route = createRootRoute({
  component: AppShell,
  errorComponent: ErrorScreen,
  notFoundComponent: NotFoundScreen,
});
