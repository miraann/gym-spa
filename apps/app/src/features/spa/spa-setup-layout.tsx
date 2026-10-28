import { PageHeader } from '@gym/ui/blocks/page-header';
import { cn } from '@gym/ui/lib/utils';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { BathIcon, DoorOpenIcon, PackageIcon, UsersIcon, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AppPath } from '@/app/navigation';
import { RequirePermission } from '@/components/no-access';

const TABS: readonly {
  to: AppPath;
  key: 'services' | 'rooms' | 'therapists' | 'packages';
  icon: LucideIcon;
}[] = [
  { to: '/spa/setup/services', key: 'services', icon: BathIcon },
  { to: '/spa/setup/rooms', key: 'rooms', icon: DoorOpenIcon },
  { to: '/spa/setup/therapists', key: 'therapists', icon: UsersIcon },
  { to: '/spa/setup/packages', key: 'packages', icon: PackageIcon },
];

/** /spa/setup (spa.manage): the spa's services, rooms, staff and packages, one page each. */
export function SpaSetupLayout() {
  const { t } = useTranslation('spa');
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <RequirePermission permission="spa.manage">
      <div className="flex flex-col gap-6">
        <PageHeader title={t('setup.title')} description={t('setup.description')} />
        <nav
          aria-label={t('setup.tabs.label')}
          className="flex w-full overflow-x-auto rounded-full bg-muted p-1 sm:w-fit dark:bg-muted/70"
        >
          {TABS.map(({ to, key, icon: Icon }) => {
            const selected = pathname.startsWith(to);
            return (
              <Link
                key={key}
                to={to}
                aria-current={selected ? 'page' : undefined}
                className={cn(
                  'flex h-10 flex-1 items-center justify-center gap-2 rounded-full px-3 text-sm whitespace-nowrap transition-[background-color,color,box-shadow] duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-5 pointer-coarse:h-11',
                  selected
                    ? 'bg-card font-semibold text-foreground shadow-sm'
                    : 'font-medium text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon aria-hidden className="size-4.5" />
                {t(`setup.tabs.${key}`)}
              </Link>
            );
          })}
        </nav>
        <Outlet />
      </div>
    </RequirePermission>
  );
}
