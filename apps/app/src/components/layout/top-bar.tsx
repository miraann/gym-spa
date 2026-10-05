import { SearchIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ConnectionStatus } from './connection-status';
import { LanguageMenu } from './language-menu';
import { ThemeMenu } from './theme-menu';

export function TopBar({ onOpenSearch }: { readonly onOpenSearch: () => void }) {
  const { t } = useTranslation();

  return (
    // box-content + pt: the bar grows under the Android status bar so its background fills it.
    <header className="sticky top-0 z-10 box-content flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur supports-backdrop-filter:bg-background/80">
      <SidebarTrigger />
      <Separator orientation="vertical" className="data-vertical:h-5 data-vertical:self-center" />
      <Button
        variant="outline"
        size="sm"
        onClick={onOpenSearch}
        aria-label={t('search.open')}
        className="justify-start gap-2 text-muted-foreground sm:w-60"
      >
        <SearchIcon />
        <span className="hidden flex-1 text-start sm:inline">{t('search.open')}</span>
        <Kbd dir="ltr" className="hidden sm:inline-flex">
          {t('search.shortcut')}
        </Kbd>
      </Button>
      <div className="ms-auto flex items-center gap-1">
        <ConnectionStatus />
        <LanguageMenu />
        <ThemeMenu />
      </div>
    </header>
  );
}
