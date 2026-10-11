import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gym/ui/components/card';
import { ShieldCheckIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PreferenceMenus } from '@/shell/preference-menus';

/** The frame of every sign-in step: the panel's name, a card, and the language and theme menus. */
export function AuthLayout({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
}) {
  const { t } = useTranslation('seller');
  return (
    <div data-auth-screen className="flex min-h-svh flex-col bg-muted/40">
      <header className="flex min-h-16 items-center gap-3 px-4 py-2">
        <span className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <ShieldCheckIcon aria-hidden="true" />
        </span>
        <span className="grid leading-tight">
          <span className="text-lg">{t('app.name')}</span>
          <span className="text-xs text-muted-foreground">{t('app.product')}</span>
        </span>
        <div className="ms-auto">
          <PreferenceMenus />
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
