import { SearchIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@gym/ui/components/button';
import { Kbd } from '@gym/ui/components/kbd';
import { Separator } from '@gym/ui/components/separator';
import { SidebarTrigger } from '@gym/ui/components/sidebar';
import { usePageTitle } from '@gym/ui/hooks/use-page-title';
import { cn } from '@gym/ui/lib/utils';
import { UserMenu } from '@/features/auth/user-menu';
import { NotificationBell } from '@/features/notifications/notification-bell';
import { useHasBell } from '@/features/notifications/use-has-bell';
import type { Layout } from '@gym/ui/hooks/use-layout';
import { ConnectionStatus } from './connection-status';
import { GymMark } from './gym-mark';
import { LanguageMenu } from './language-menu';
import { ThemeMenu } from './theme-menu';
import { useGymName } from './use-gym-name';

export function TopBar({
  layout,
  onOpenSearch,
}: {
  readonly layout: Layout;
  readonly onOpenSearch: () => void;
}) {
  const { t } = useTranslation();
  const gymName = useGymName();
  const pageTitle = usePageTitle();
  const hasBell = useHasBell();
  const phone = layout === 'phone';
  // Phones: once the page's large title scrolls away, the bar shows it in small type.
  const compactTitle = phone && pageTitle.collapsed ? pageTitle.title : null;

  return (
    // box-content + pt: the bar grows under the Android status bar so its background fills it.
    // Frosted glass with a solid fallback (CLAUDE.md → Design: glass only on floating bars).
    <header
      data-slot="top-bar"
      className={cn(
        'sticky top-0 z-10 box-content flex h-14 shrink-0 items-center gap-2 border-b border-transparent bg-background px-3 pt-[env(safe-area-inset-top)] transition-[border-color] duration-200 supports-backdrop-filter:bg-(--glass) supports-backdrop-filter:backdrop-blur-xl supports-backdrop-filter:backdrop-saturate-150 md:px-4',
        (compactTitle !== null || !phone) && 'border-border/70',
      )}
    >
      {layout === 'desktop' && (
        <>
          <SidebarTrigger />
          <Separator
            orientation="vertical"
            className="data-vertical:h-5 data-vertical:self-center"
          />
        </>
      )}
      {phone && (
        // Phones have no sidebar: the gym's logo and name tell staff where they are, until the
        // page's own title takes the bar's middle.
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <GymMark className="size-9" />
          <span
            className={cn(
              'truncate font-bold transition-opacity duration-200',
              compactTitle !== null && 'opacity-0',
            )}
            aria-hidden={compactTitle !== null}
          >
            {gymName ?? t('app.name')}
          </span>
        </div>
      )}
      {phone && (
        // Between the gym's logo and the buttons at the end (search, connection, bell, staff
        // menu), so a long title is cut short instead of running under them.
        <span
          aria-hidden
          data-slot="compact-title"
          className={cn(
            'pointer-events-none absolute start-14 bottom-0 flex h-14 items-center justify-center truncate text-base font-bold transition-[opacity,translate] duration-200 ease-spring motion-reduce:transition-none',
            hasBell ? 'end-48' : 'end-38',
            compactTitle === null ? 'translate-y-1 opacity-0' : 'translate-y-0 opacity-100',
          )}
        >
          <span className="truncate">{compactTitle ?? pageTitle.title}</span>
        </span>
      )}
      <Button
        variant={phone ? 'ghost' : 'outline'}
        size={phone ? 'icon' : 'default'}
        onClick={onOpenSearch}
        aria-label={t('search.open')}
        className={
          phone
            ? 'shrink-0 rounded-full [&_svg:not([class*=size-])]:size-5'
            : 'justify-start gap-2 rounded-full bg-muted/60 font-normal text-muted-foreground shadow-none sm:w-72'
        }
      >
        <SearchIcon />
        {!phone && (
          <>
            <span className="hidden flex-1 text-start sm:inline">{t('search.open')}</span>
            <Kbd dir="ltr" className="hidden sm:inline-flex">
              {t('search.shortcut')}
            </Kbd>
          </>
        )}
      </Button>
      <div className={cn('flex shrink-0 items-center gap-1', !phone && 'ms-auto')}>
        <ConnectionStatus />
        <NotificationBell compact={phone} />
        {/* On phones, language and theme are in the staff member's menu. */}
        {!phone && (
          <>
            <LanguageMenu />
            <ThemeMenu />
          </>
        )}
        <UserMenu compact={phone} />
      </div>
    </header>
  );
}
