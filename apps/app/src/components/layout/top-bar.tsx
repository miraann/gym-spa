import { SearchIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { UserMenu } from '@/features/auth/user-menu';
import type { Layout } from '@/hooks/use-layout';
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
  const phone = layout === 'phone';

  return (
    // box-content + pt: the bar grows under the Android status bar so its background fills it.
    // Glass with a solid fallback (CLAUDE.md → Design: glass only on floating bars).
    <header className="sticky top-0 z-10 box-content flex h-14 shrink-0 items-center gap-2 bg-background px-3 pt-[env(safe-area-inset-top)] supports-backdrop-filter:bg-background/80 supports-backdrop-filter:backdrop-blur-md">
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
        // Phones have no sidebar: the gym's name tells staff where they are.
        <div className="flex min-w-0 items-center gap-2">
          <GymMark />
          <span className="truncate">{gymName ?? t('app.name')}</span>
        </div>
      )}
      <Button
        variant={phone ? 'ghost' : 'outline'}
        size={phone ? 'icon' : 'sm'}
        onClick={onOpenSearch}
        aria-label={t('search.open')}
        className={phone ? 'ms-auto' : 'justify-start gap-2 text-muted-foreground sm:w-60'}
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
      <div className={phone ? 'flex items-center gap-1' : 'ms-auto flex items-center gap-1'}>
        <ConnectionStatus />
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
