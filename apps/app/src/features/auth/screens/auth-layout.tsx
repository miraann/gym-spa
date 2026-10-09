import { DumbbellIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageMenu } from '@/components/layout/language-menu';
import { ThemeMenu } from '@/components/layout/theme-menu';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** The frame of every login and unlock screen: app name, a card, and the language and theme menus. */
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

  return (
    // data-auth-screen: Android's Back leaves the app here (see app/back-button.ts).
    <div
      data-auth-screen
      className="flex min-h-svh flex-col bg-muted/40 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
    >
      <header className="flex h-14 items-center gap-2 px-4">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <DumbbellIcon className="size-4" />
        </span>
        <span className="font-semibold">{t('app.name')}</span>
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
