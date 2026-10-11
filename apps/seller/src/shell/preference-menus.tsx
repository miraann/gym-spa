import type { ThemePreference } from '@gym/core';
import { LANGUAGES, LANGUAGE_CODES } from '@gym/i18n';
import { Button } from '@gym/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@gym/ui/components/dropdown-menu';
import { LanguagesIcon, MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { setPreference, usePreferences } from '@/lib/preferences';

const THEMES: readonly { value: ThemePreference; icon: typeof SunIcon }[] = [
  { value: 'light', icon: SunIcon },
  { value: 'dark', icon: MoonIcon },
  { value: 'system', icon: MonitorIcon },
];

/** Language and light/dark, for this browser only. */
export function PreferenceMenus() {
  const { t } = useTranslation('common');
  const { language, theme } = usePreferences();
  const ThemeIcon = THEMES.find((each) => each.value === theme)?.icon ?? MonitorIcon;

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label={t('language.change')}>
            <LanguagesIcon data-icon="inline-start" />
            <span lang={language}>{LANGUAGES[language].nativeName}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup
            value={language}
            onValueChange={(value) => {
              const chosen = LANGUAGE_CODES.find((code) => code === value);
              if (chosen) setPreference('language', chosen);
            }}
          >
            {LANGUAGE_CODES.map((code) => (
              <DropdownMenuRadioItem key={code} value={code} lang={code}>
                {LANGUAGES[code].nativeName}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('theme.change')}>
            <ThemeIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup
            value={theme}
            onValueChange={(value) => {
              const chosen = THEMES.find((each) => each.value === value);
              if (chosen) setPreference('theme', chosen.value);
            }}
          >
            {THEMES.map(({ value, icon: Icon }) => (
              <DropdownMenuRadioItem key={value} value={value}>
                <Icon />
                {t(`theme.${value}`)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
