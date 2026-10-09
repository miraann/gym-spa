import { isLanguage, LANGUAGE_CODES, LANGUAGES } from '@gym/i18n';
import { LanguagesIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useChangeLanguage } from '@/features/auth/use-change-language';
import { usePreferences } from '@/lib/preferences';

export function LanguageMenu() {
  const { t } = useTranslation();
  const { language } = usePreferences();
  const changeLanguage = useChangeLanguage();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t('language.change')}>
          <LanguagesIcon />
          <span className="hidden sm:inline">{LANGUAGES[language].nativeName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuLabel>{t('language.label')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={language}
          onValueChange={(value) => {
            if (isLanguage(value)) changeLanguage(value);
          }}
        >
          {LANGUAGE_CODES.map((code) => (
            // Each language name is written in its own language.
            <DropdownMenuRadioItem key={code} value={code} lang={code}>
              {LANGUAGES[code].nativeName}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
