import { createRouter } from '@tanstack/react-router';
import { ErrorScreen, NotFoundScreen } from '@/components/error-screen';
import { routeTree } from './routeTree.gen';

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
  defaultErrorComponent: ErrorScreen,
  defaultNotFoundComponent: NotFoundScreen,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
