import { getDirection } from '@gym/i18n';
import { Link, useRouterState } from '@tanstack/react-router';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { isNavItemActive, visibleNavGroups, type OpenNavItem } from '@/app/navigation';
import { Separator } from '@gym/ui/components/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@gym/ui/components/tooltip';
import { usePermissions } from '@/features/auth/use-permissions';
import { usePreferences } from '@/lib/preferences';
import { cn } from '@gym/ui/lib/utils';
import { NavArt } from './nav-art';
import { GymMark } from './gym-mark';
import { useGymName } from './use-gym-name';

/**
 * Tablets (768–1279px): the menu as an icon rail on the reading-start side, like a tablet app's.
 * Each item shows its short name in at most two lines; the full name is the tooltip and the
 * accessible name. Pages that are not built yet are not shown.
 */
export function NavRail() {
  const { t } = useTranslation(['common', 'nav']);
  const groups = visibleNavGroups(usePermissions());
  const gymName = useGymName();

  return (
    <nav
      data-slot="nav-rail"
      aria-label={t('sidebar.title')}
      className="sticky top-0 flex h-svh w-24 shrink-0 flex-col items-stretch gap-1 overflow-y-auto border-e border-sidebar-border bg-sidebar px-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-[calc(env(safe-area-inset-bottom)+0.5rem)] text-sidebar-foreground *:shrink-0"
    >
      <Link
        to="/"
        aria-label={gymName ?? t('app.name')}
        className="mx-auto mb-2 rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <GymMark className="size-12 rounded-2xl" />
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

function RailItem({ item }: { readonly item: OpenNavItem }) {
  const { t } = useTranslation('nav');
  const { language } = usePreferences();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const label = t(`items.${item.key}`);
  const isActive = isNavItemActive(item, pathname);
  // Radix sides are physical: the tooltip opens towards the page, away from the rail.
  const tooltipSide = getDirection(language) === 'rtl' ? 'left' : 'right';

  const content = (
    <>
      <span
        className={cn(
          'flex h-11 w-14 items-center justify-center rounded-full transition-colors duration-150 motion-reduce:transition-none',
          isActive
            ? 'bg-primary bg-(image:--gradient-primary) shadow-[0_6px_16px_-6px_var(--glow)]'
            : 'group-hover/rail:bg-sidebar-accent',
        )}
      >
        <NavArt art={item.art} className={isActive ? 'size-7' : 'size-8'} />
      </span>
      <span
        data-slot="rail-label"
        className={cn(
          'line-clamp-2 w-full text-center text-xs leading-tight [overflow-wrap:anywhere]',
          isActive ? 'font-semibold text-foreground' : 'text-muted-foreground',
        )}
      >
        {t(`short.${item.key}`)}
      </span>
    </>
  );
  const className =
    'group/rail flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-2xl py-1.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={item.to}
          aria-label={label}
          aria-current={isActive ? 'page' : undefined}
          className={className}
        >
          {content}
        </Link>
      </TooltipTrigger>
      <TooltipContent side={tooltipSide}>{label}</TooltipContent>
    </Tooltip>
  );
}
