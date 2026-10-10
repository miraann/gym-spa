import { localizedName } from '@gym/i18n';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { GymMark } from '@/components/layout/gym-mark';
import { LanguageMenu } from '@/components/layout/language-menu';
import { ThemeMenu } from '@/components/layout/theme-menu';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePreferences } from '@/lib/preferences';
import { useDeviceGym } from '../auth-context';

/**
 * The frame of every login and unlock screen: the device's gym (logo and name, once it has one;
 * the app's name before), a card, and the language and theme menus.
 */
export function AuthLayout({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
}) {
  const { t } = useTranslation();
  const gym = useDeviceGym();
  const { language } = usePreferences();

  return (
    // data-auth-screen: Android's Back leaves the app here (see app/back-button.ts).
    <div
      data-auth-screen
      className="flex min-h-svh flex-col bg-muted/40 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
    >
      <header className="flex min-h-16 items-center gap-3 px-4 py-2">
        <GymMark className="size-11" />
        {gym ? (
          <span className="grid min-w-0 leading-tight">
            <span data-testid="device-gym" className="truncate text-lg">
              {localizedName(gym, language)}
            </span>
            <span className="truncate text-xs text-muted-foreground">{t('app.name')}</span>
          </span>
        ) : (
          <span className="shrink-0 text-lg">{t('app.name')}</span>
        )}
        <div className="ms-auto flex items-center gap-1">
          <LanguageMenu />
          <ThemeMenu />
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center p-4 sm:items-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>
              <h1 className="text-xl">{title}</h1>
            </CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">{children}</CardContent>
        </Card>
      </main>
    </div>
  );
}
