import { Link, useRouterState } from '@tanstack/react-router';
import { SearchIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@gym/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gym/ui/components/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@gym/ui/components/tooltip';
import { cn } from '@gym/ui/lib/utils';
import {
  isNavItemActive,
  visibleNavGroups,
  type OpenNavItem,
  type VisibleNavGroup,
} from '@/app/navigation';
import { UserMenu } from '@/features/auth/user-menu';
import { usePermissions } from '@/features/auth/use-permissions';
import { NotificationBell } from '@/features/notifications/notification-bell';
import { ConnectionStatus } from './connection-status';
import { GymMark } from './gym-mark';
import { NavArt } from './nav-art';
import { useGymName } from './use-gym-name';

/**
 * Desktops (≥ 1280px; step D-4, the user's choice of 2026-10-30): the menu as a top bar of large
 * 3D pictures with their names, the gym at the reading start and the staff member's buttons at the
 * end. The daily pages (home, check-in) have their own place; every other group is one place that
 * opens its pages, or the page itself when only one of them is open to the staff member. The page
 * being shown sits in a soft brand box, its picture on the brand gradient.
 */
export function TopNav({ onOpenSearch }: { readonly onOpenSearch: () => void }) {
  const { t } = useTranslation(['common', 'nav']);
  const groups = visibleNavGroups(usePermissions());
  const gymName = useGymName();

  return (
    <header
      data-slot="top-nav"
      className="sticky top-0 z-20 box-content shrink-0 border-b border-border/70 bg-background pt-[env(safe-area-inset-top)] glass:bg-(--glass) glass:backdrop-blur-md"
    >
      <div className="mx-auto flex w-full max-w-[100rem] items-center gap-4 px-6 py-2">
        <div className="flex w-60 shrink-0 items-center gap-3">
          <Link
            to="/"
            aria-label={gymName ?? t('app.name')}
            className="shrink-0 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <GymMark className="size-14 rounded-full shadow-md ring-3 ring-card" />
          </Link>
          {/* The gym's name first: staff work for the gym, the app is secondary. Below it, the
              connection and the app version, so support can tell which build a device runs. */}
          <div className="flex min-w-0 flex-col items-start gap-1">
            <span className="line-clamp-2 text-base leading-tight">
              {gymName ?? t('app.fullName')}
            </span>
            <span className="flex items-center gap-2">
              <ConnectionStatus />
              <span dir="ltr" data-slot="app-version" className="text-xs text-muted-foreground">
                {import.meta.env.VITE_APP_VERSION}
              </span>
            </span>
          </div>
        </div>

        <nav
          aria-label={t('sidebar.title')}
          className="flex min-w-0 flex-1 [scrollbar-width:none] items-stretch justify-center gap-1 overflow-x-auto"
        >
          {groups.flatMap((group) =>
            group.flat || group.items.length === 1
              ? group.items.map((item) => <TopNavLink key={item.key} item={item} />)
              : [<TopNavGroup key={group.key} group={group} />],
          )}
        </nav>

        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onOpenSearch}
                aria-label={t('search.open')}
                aria-keyshortcuts="Control+K"
                className="rounded-full [&_svg:not([class*=size-])]:size-5"
              >
                <SearchIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <span>{t('search.open')}</span> <span dir="ltr">{t('search.shortcut')}</span>
            </TooltipContent>
          </Tooltip>
          <NotificationBell compact={false} />
          {/* Language and theme are in the staff member's menu, which leaves the pictures room. */}
          <UserMenu compact />
        </div>
      </div>
    </header>
  );
}

const PLACE =
  'group/place flex min-w-22 max-w-32 shrink-0 flex-col items-center gap-1.5 rounded-2xl px-1 py-2 outline-none transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none';

function Place({
  art,
  label,
  isActive,
}: {
  readonly art: string;
  readonly label: string;
  readonly isActive: boolean;
}) {
  return (
    <>
      <span
        className={cn(
          'flex size-14 items-center justify-center rounded-full transition-[translate,scale] duration-200 ease-spring group-hover/place:-translate-y-0.5 group-active/place:scale-95 motion-reduce:transition-none',
          isActive &&
            'bg-primary bg-(image:--gradient-primary) shadow-[0_8px_20px_-6px_var(--glow)]',
        )}
      >
        <NavArt art={art} className={isActive ? 'size-9' : 'size-11'} />
      </span>
      <span
        data-slot="top-nav-label"
        className={cn(
          'line-clamp-2 w-full text-center text-sm leading-tight',
          isActive ? 'text-primary' : 'text-foreground/80',
        )}
      >
        {label}
      </span>
    </>
  );
}

function placeClass(isActive: boolean) {
  return cn(PLACE, isActive ? 'bg-accent ring-1 ring-primary/25' : 'hover:bg-muted/70');
}

function TopNavLink({ item }: { readonly item: OpenNavItem }) {
  const { t } = useTranslation('nav');
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isActive = isNavItemActive(item, pathname);

  return (
    <Link
      to={item.to}
      aria-label={t(`items.${item.key}`)}
      aria-current={isActive ? 'page' : undefined}
      className={placeClass(isActive)}
    >
      <Place art={item.art} label={t(`short.${item.key}`)} isActive={isActive} />
    </Link>
  );
}

function TopNavGroup({ group }: { readonly group: VisibleNavGroup }) {
  const { t } = useTranslation('nav');
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isActive = group.items.some((item) => isNavItemActive(item, pathname));

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" data-nav-group={group.key} className={placeClass(isActive)}>
          <Place art={group.art} label={t(`groups.${group.key}`)} isActive={isActive} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="min-w-60 p-2">
        {group.items.map((item) => {
          const current = isNavItemActive(item, pathname);
          return (
            <DropdownMenuItem
              key={item.key}
              asChild
              className={cn('min-h-12 gap-3 rounded-xl px-2 text-base', current && 'bg-accent')}
            >
              <Link to={item.to} aria-current={current ? 'page' : undefined}>
                <NavArt art={item.art} className="size-8" />
                <span className={cn(current && 'text-primary')}>{t(`items.${item.key}`)}</span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
