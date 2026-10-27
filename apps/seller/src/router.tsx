import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  useParams,
} from '@tanstack/react-router';
import { AccountPage } from '@/account/account-page';
import { AdminsPage } from '@/admins/admins-page';
import { CreateGymPage } from '@/gyms/create-gym-page';
import { GymPage } from '@/gyms/gym-page';
import { GymsPage } from '@/gyms/gyms-page';
import { LogPage } from '@/log/log-page';
import { PanelShell } from '@/shell/panel-shell';
import { SupportMemberPage, SupportMembersPage } from '@/support/support-pages';

// The panel's pages, under /seller/ (its base path on the gym app's domain).

const rootRoute = createRootRoute({ component: PanelShell });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router's redirect
    throw redirect({ to: '/gyms' });
  },
});

const gymsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/gyms',
  component: GymsPage,
});

const newGymRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/gyms/new',
  component: CreateGymPage,
});

function GymRoute() {
  const { gymId } = useParams({ from: '/gyms/$gymId' });
  return <GymPage gymId={gymId} />;
}

const gymRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/gyms/$gymId',
  component: GymRoute,
});

function SupportMembersRoute() {
  const { gymId } = useParams({ from: '/gyms/$gymId/support' });
  return <SupportMembersPage gymId={gymId} />;
}

const supportMembersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/gyms/$gymId/support',
  component: SupportMembersRoute,
});

function SupportMemberRoute() {
  const { gymId, memberId } = useParams({ from: '/gyms/$gymId/support/$memberId' });
  return <SupportMemberPage gymId={gymId} memberId={memberId} />;
}

const supportMemberRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/gyms/$gymId/support/$memberId',
  component: SupportMemberRoute,
});

const adminsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admins',
  component: AdminsPage,
});

const logRoute = createRoute({ getParentRoute: () => rootRoute, path: '/log', component: LogPage });

const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/account',
  component: AccountPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  gymsRoute,
  newGymRoute,
  gymRoute,
  supportMembersRoute,
  supportMemberRoute,
  adminsRoute,
  logRoute,
  accountRoute,
]);

export const router = createRouter({
  routeTree,
  basepath: '/seller',
  defaultNotFoundComponent: GymsPage,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
