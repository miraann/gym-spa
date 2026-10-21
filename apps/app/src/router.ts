import { createRouter } from '@tanstack/react-router';
import { ErrorScreen, NotFoundScreen } from '@/components/error-screen';
import { routeTree } from './routeTree.gen';

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
  // Page transitions (theme.css): a short slide forward into a deeper page and back out of it,
  // only when the page changes (typing in a page's search changes only its search params).
  defaultViewTransition: {
    types: ({ fromLocation, toLocation, pathChanged }) => {
      if (!pathChanged || !fromLocation) return false;
      const depth = (path: string) => path.split('/').filter(Boolean).length;
      const from = depth(fromLocation.pathname);
      const to = depth(toLocation.pathname);
      return [to > from ? 'forward' : to < from ? 'back' : 'page'];
    },
  },
  defaultErrorComponent: ErrorScreen,
  defaultNotFoundComponent: NotFoundScreen,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
