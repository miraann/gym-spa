import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { navPages } from '@/app/navigation';
import { usePermissions } from '@/features/auth/use-permissions';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

/** Ctrl+K search. Pages for now; members and card scans join it in Phase 2. */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(['common', 'nav']);
  const pages = navPages(usePermissions());
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // `code` is the physical key, so Ctrl+K also works with Kurdish and Arabic keyboard layouts.
      if (event.code === 'KeyK' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onOpenChange]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('search.open')}
      description={t('search.placeholder')}
    >
      <Command>
        <CommandInput placeholder={t('search.placeholder')} />
        <CommandList>
          <CommandEmpty>{t('search.empty')}</CommandEmpty>
          <CommandGroup heading={t('search.pages')}>
            {pages.map((item) => {
              const label = t(`nav:items.${item.key}`);
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.key}
                  value={label}
                  onSelect={() => {
                    onOpenChange(false);
                    void navigate({ to: item.to });
                  }}
                >
                  <Icon />
                  <span>{label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
