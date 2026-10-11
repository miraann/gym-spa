import { useLayout } from '@gym/ui/hooks/use-layout';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Button } from '@gym/ui/components/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@gym/ui/components/sheet';
import { Link, Outlet } from '@tanstack/react-router';
import {
  Building2Icon,
  LogOutIcon,
  MenuIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  UserRoundIcon,
  UsersRoundIcon,
  WifiOffIcon,
} from 'lucide-react';
import { useCallback, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useIdleSignOut } from '@/auth/idle';
import { useMe, useSession } from '@/auth/session';
import { getDirection } from '@gym/i18n';
import { usePreferences } from '@/lib/preferences';
import { PreferenceMenus } from './preference-menus';

const NAV = [
  { to: '/gyms', label: 'nav.gyms', icon: Building2Icon },
  { to: '/admins', label: 'nav.admins', icon: UsersRoundIcon },
  { to: '/log', label: 'nav.log', icon: ScrollTextIcon },
  { to: '/account', label: 'nav.account', icon: UserRoundIcon },
] as const;

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** Whether the browser has a network: the panel saves nothing without one. */
function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine);
}

function NavLinks({ onNavigate }: { readonly onNavigate?: () => void }) {
  const { t } = useTranslation('seller');
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          onClick={onNavigate}
          className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground data-[status=active]:bg-primary/10 data-[status=active]:text-primary"
        >
          <Icon className="size-5 shrink-0" aria-hidden="true" />
          {t(label)}
        </Link>
      ))}
    </nav>
  );
}

function Brand() {
  const { t } = useTranslation('seller');
  return (
    <span className="flex items-center gap-2">
      <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <ShieldCheckIcon className="size-5" aria-hidden="true" />
      </span>
      <span className="text-base">{t('app.name')}</span>
    </span>
  );
}

/** The frame of every panel page. */
export function PanelShell() {
  const { t } = useTranslation('seller');
  const layout = useLayout();
  const me = useMe();
  const { signOut } = useSession();
  const online = useOnline();
  const { language } = usePreferences();
  const [menuOpen, setMenuOpen] = useState(false);
  const onIdle = useCallback(() => {
    void signOut('idle');
  }, [signOut]);
  useIdleSignOut(onIdle);

  const account = (
    <div className="flex flex-col gap-2 border-t pt-3">
      <span className="truncate px-3 text-sm" dir="ltr">
        {me.email}
      </span>
      <Button variant="ghost" className="justify-start" onClick={() => void signOut()}>
        <LogOutIcon data-icon="inline-start" />
        {t('nav.signOut')}
      </Button>
    </div>
  );

  return (
    <div className="flex min-h-svh bg-background">
      {layout !== 'phone' && (
        <aside className="sticky top-0 flex h-svh w-64 shrink-0 flex-col gap-6 border-e bg-sidebar p-4">
          <Brand />
          <NavLinks />
          <div className="mt-auto">{account}</div>
        </aside>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex min-h-14 items-center gap-2 border-b bg-background/95 px-4 supports-backdrop-filter:bg-background/80 supports-backdrop-filter:backdrop-blur">
          {layout === 'phone' && (
            <>
              <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={t('nav.menu')}>
                    <MenuIcon />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side={getDirection(language) === 'rtl' ? 'right' : 'left'}
                  className="flex flex-col gap-6 p-4"
                >
                  <SheetHeader className="p-0">
                    <SheetTitle>
                      <Brand />
                    </SheetTitle>
                    <SheetDescription className="sr-only">{t('nav.menu')}</SheetDescription>
                  </SheetHeader>
                  <NavLinks
                    onNavigate={() => {
                      setMenuOpen(false);
                    }}
                  />
                  <div className="mt-auto">{account}</div>
                </SheetContent>
              </Sheet>
              <Brand />
            </>
          )}
          <div className="ms-auto">
            <PreferenceMenus />
          </div>
        </header>
        <main id="main" className="flex-1 p-4 md:p-6">
          {!online && (
            <Alert variant="warning" className="mb-4">
              <WifiOffIcon />
              <AlertDescription>{t('common.offline')}</AlertDescription>
            </Alert>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
