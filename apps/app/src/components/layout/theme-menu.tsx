import { MoonIcon, SunIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { THEME_CHOICES } from '@/components/theme-choices';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { setPreference, usePreferences } from '@/lib/preferences';

export function ThemeMenu() {
  const { t } = useTranslation();
  const { theme } = usePreferences();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t('theme.change')}>
          <SunIcon className="dark:hidden" />
          <MoonIcon className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuLabel>{t('theme.label')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => {
            const choice = THEME_CHOICES.find((option) => option.value === value);
            if (choice) setPreference('theme', choice.value);
          }}
        >
          {THEME_CHOICES.map(({ value, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon />
              {t(`theme.${value}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
