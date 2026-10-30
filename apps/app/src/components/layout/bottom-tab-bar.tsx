import { CHECKIN_TAB } from '@gym/core';
import { haptic } from '@gym/platform';
import { Link, useRouterState } from '@tanstack/react-router';
import { LayoutGridIcon } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { isNavItemActive, navTabItems, type OpenNavItem } from '@/app/navigation';
import { useActiveAccount } from '@/features/auth/auth-context';
import { usePermissions } from '@/features/auth/use-permissions';
import { cn } from '@gym/ui/lib/utils';
import { MoreSheet } from './more-sheet';

/**
 * Phones (< 768px): a floating, frosted pill with the staff member's 4 tabs and "More", like a
 * native app's tab bar. The tabs are their own choice or their role's defaults, and never move by
 * themselves; a page that is not built yet has no tab until it exists. Check-in, when it is a tab,
 * is the raised button in the middle. The page keeps clear of the bar (theme.css, #main).
 */
export function BottomTabBar() {
  const { t } = useTranslation('nav');
  const account = useActiveAccount();
  const permissions = usePermissions();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [moreOpen, setMoreOpen] = useState(false);
  const navTabs = account?.navTabs ?? null;
  const roleKey = account?.roleKey ?? null;
  const tabs = useMemo(
    () => navTabItems(navTabs, roleKey, permissions),
    [navTabs, roleKey, permissions],
  );
  // A page that isn't a tab was opened from "More": show that.
  const onMorePage = !tabs.some((item) => isNavItemActive(item, pathname));

  return (
    <>
      <nav
        data-slot="tab-bar"
        aria-label={t('tabBar.label')}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 pb-[calc(var(--tab-bar-gap)+env(safe-area-inset-bottom))]"
      >
        <ul className="pointer-events-auto mx-auto flex h-(--tab-bar-height) max-w-md items-stretch rounded-full bg-card px-1.5 shadow-lg ring-1 ring-foreground/7 glass:bg-(--glass) glass:backdrop-blur-md">
          {tabs.map((item) => (
            <li key={item.key} className="flex min-w-0 flex-1">
              <Tab item={item} isActive={isNavItemActive(item, pathname)} />
            </li>
          ))}
          <li className="flex min-w-0 flex-1">
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              onClick={() => {
                haptic('selection');
                setMoreOpen(true);
              }}
              className={TAB_CLASS}
            >
              <TabContent
                icon={<LayoutGridIcon aria-hidden className="size-6" />}
                label={t('tabBar.more')}
                isActive={onMorePage || moreOpen}
              />
            </button>
          </li>
        </ul>
      </nav>
      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} />
    </>
  );
}

const TAB_CLASS =
  'group/tab flex h-full w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

function Tab({ item, isActive }: { readonly item: OpenNavItem; readonly isActive: boolean }) {
  const { t } = useTranslation('nav');
  const label = t(`items.${item.key}`);
  const Icon = item.icon;
  const raised = item.key === CHECKIN_TAB;

  return (
    <Link
      to={item.to}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      onClick={() => {
        if (!isActive) haptic('selection');
      }}
      className={TAB_CLASS}
    >
      <TabContent
        icon={<Icon aria-hidden className={raised ? 'size-7' : 'size-6'} />}
        label={t(`short.${item.key}`)}
        isActive={isActive}
        raised={raised}
      />
    </Link>
  );
}

function TabContent({
  icon,
  label,
  isActive,
  raised = false,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly isActive: boolean;
  readonly raised?: boolean;
}) {
  return (
    <>
      <span
        className={cn(
          'flex items-center justify-center rounded-full transition-[background-color,color,scale] duration-200 ease-spring motion-safe:group-active/tab:scale-90 motion-reduce:transition-none',
          raised
            ? '-mt-7 size-15 bg-primary text-primary-foreground shadow-lg ring-4 ring-background'
            : cn('h-8 w-14', isActive ? 'bg-primary/12 text-primary' : 'text-muted-foreground'),
        )}
      >
        {icon}
      </span>
      <span
        className={cn(
          'max-w-full truncate px-0.5 text-[0.6875rem] leading-tight',
          isActive ? 'font-bold text-primary' : 'font-medium text-muted-foreground',
        )}
      >
        {label}
      </span>
    </>
  );
}
