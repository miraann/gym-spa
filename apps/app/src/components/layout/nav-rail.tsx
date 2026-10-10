import { getDirection } from '@gym/i18n';
import { Link, useRouterState } from '@tanstack/react-router';
import { DumbbellIcon } from 'lucide-react';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { isNavItemActive, visibleNavGroups, type NavItem } from '@/app/navigation';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { usePermissions } from '@/features/auth/use-permissions';
import { usePreferences } from '@/lib/preferences';
import { cn } from '@/lib/utils';
import { useGymName } from './use-gym-name';

/**
 * Tablets (768–1279px): the menu as an icon rail on the reading-start side. Each item shows its
 * short name in at most two lines; the full name is the tooltip and the accessible name.
 */
export function NavRail() {
  const { t } = useTranslation(['common', 'nav']);
  const groups = visibleNavGroups(usePermissions());
  const gymName = useGymName();

  return (
    <nav
      data-slot="nav-rail"
      aria-label={t('sidebar.title')}
      className="sticky top-0 flex h-svh w-22 shrink-0 flex-col items-stretch gap-1 overflow-y-auto bg-sidebar px-1.5 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-[calc(env(safe-area-inset-bottom)+0.5rem)] text-sidebar-foreground *:shrink-0"
    >
      <Link
        to="/"
        aria-label={gymName ?? t('app.name')}
        className="mx-auto mb-1 flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <DumbbellIcon aria-hidden className="size-5" />
      </Link>
      {groups.map((group, index) => (
        <Fragment key={group.key}>
          {index > 0 && <Separator className="mx-auto my-1 data-horizontal:w-8" />}
          {group.items.map((item) => (
            <RailItem key={item.key} item={item} />
          ))}
        </Fragment>
      ))}
    </nav>
  );
}

function RailItem({ item }: { readonly item: NavItem }) {
  const { t } = useTranslation(['common', 'nav']);
  const { language } = usePreferences();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const label = t(`nav:items.${item.key}`);
  const isActive = isNavItemActive(item, pathname);
  const Icon = item.icon;
  const soon = item.to === undefined;
  // Radix sides are physical: the tooltip opens towards the page, away from the rail.
  const tooltipSide = getDirection(language) === 'rtl' ? 'left' : 'right';

  const content = (
    <>
      <span
        className={cn(
          'flex h-8 w-12 items-center justify-center rounded-full transition-colors motion-reduce:transition-none',
          isActive ? 'bg-accent text-accent-foreground' : 'group-hover/rail:bg-sidebar-accent',
        )}
      >
        <Icon aria-hidden className="size-5" />
      </span>
      <span
        data-slot="rail-label"
        className={cn(
          'line-clamp-2 w-full text-center text-[0.6875rem] leading-tight [overflow-wrap:anywhere]',
          isActive ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {t(`nav:short.${item.key}`)}
      </span>
    </>
  );
  const className =
    'group/rail flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-2xl py-1.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {soon ? (
          // Not built yet: focusable (so the tooltip says so), but it goes nowhere.
          <button
            type="button"
            aria-disabled="true"
            aria-label={`${label} (${t('sidebar.soon')})`}
            className={cn(className, 'cursor-default opacity-50')}
          >
            {content}
          </button>
        ) : (
          <Link
            to={item.to}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            className={className}
          >
            {content}
          </Link>
        )}
      </TooltipTrigger>
      <TooltipContent side={tooltipSide}>
        {soon ? `${label} (${t('sidebar.soon')})` : label}
      </TooltipContent>
    </Tooltip>
  );
}
