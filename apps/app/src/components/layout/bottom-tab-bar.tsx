import { CHECKIN_TAB } from '@gym/core';
import { Link, useRouterState } from '@tanstack/react-router';
import { LayoutGridIcon } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { isNavItemActive, navTabItems, type NavItem } from '@/app/navigation';
import { useActiveAccount } from '@/features/auth/auth-context';
import { usePermissions } from '@/features/auth/use-permissions';
import { cn } from '@/lib/utils';
import { MoreSheet } from './more-sheet';

/**
 * Phones (< 768px): a floating pill with the staff member's 4 tabs and "More". The tabs are their
 * own choice or their role's defaults, and never move by themselves. Check-in, when it is a tab,
 * is the raised button in the middle. The page keeps clear of the bar (styles.css, #main).
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
        <ul className="pointer-events-auto mx-auto flex h-(--tab-bar-height) max-w-md items-stretch rounded-full border bg-card px-1 shadow-lg supports-backdrop-filter:bg-card/80 supports-backdrop-filter:backdrop-blur-md">
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
                setMoreOpen(true);
              }}
              className={TAB_CLASS}
            >
              <TabContent
                icon={<LayoutGridIcon aria-hidden className="size-5" />}
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
  'flex h-full w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

function Tab({ item, isActive }: { readonly item: NavItem; readonly isActive: boolean }) {
  const { t } = useTranslation(['common', 'nav']);
  const label = t(`nav:items.${item.key}`);
  const Icon = item.icon;
  const raised = item.key === CHECKIN_TAB;
  const soon = item.to === undefined;
  const content = (
    <TabContent
      icon={<Icon aria-hidden className={raised ? 'size-6' : 'size-5'} />}
      label={t(`nav:short.${item.key}`)}
      isActive={isActive}
      raised={raised}
      soon={soon}
    />
  );

  if (soon) {
    // Not built yet: it keeps its place, so tabs don't move once the page arrives.
    return (
      <span
        role="link"
        aria-disabled="true"
        aria-label={`${label} (${t('sidebar.soon')})`}
        className={cn(TAB_CLASS, 'opacity-50')}
      >
        {content}
      </span>
    );
  }
  return (
    <Link
      to={item.to}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      className={TAB_CLASS}
    >
      {content}
    </Link>
  );
}

function TabContent({
  icon,
  label,
  isActive,
  raised = false,
  soon = false,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly isActive: boolean;
  readonly raised?: boolean;
  readonly soon?: boolean;
}) {
  return (
    <>
      <span
        className={cn(
          'flex items-center justify-center rounded-full transition-colors motion-reduce:transition-none',
          raised
            ? cn(
                '-mt-6 size-14 shadow-lg ring-4 ring-background',
                soon ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground',
              )
            : cn('h-8 w-14', isActive && 'bg-accent text-accent-foreground'),
        )}
      >
        {icon}
      </span>
      <span
        className={cn(
          'max-w-full truncate px-0.5 text-[0.6875rem] leading-tight',
          isActive ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
    </>
  );
}
