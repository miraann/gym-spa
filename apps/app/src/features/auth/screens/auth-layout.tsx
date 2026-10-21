import { localizedName } from '@gym/i18n';
import { useSideBySide } from '@gym/ui/hooks/use-side-by-side';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { STRONG_BRAND_TOKENS } from '@/components/brand-surface';
import { GymMark } from '@/components/layout/gym-mark';
import { LanguageMenu } from '@/components/layout/language-menu';
import { ThemeMenu } from '@/components/layout/theme-menu';
import { usePreferences } from '@/lib/preferences';
import { useDeviceGym } from '../auth-context';

/**
 * The frame of every login and unlock screen (step D-3). Wide screens: a brand panel with the
 * gym's logo and name on the reading-start side, the form on the other. Phones: one full screen,
 * like a native app's login, with the logo on top. Before a device has a gym, the app's name
 * stands in for it.
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
  const wide = useSideBySide();

  return (
    // data-auth-screen: Android's Back leaves the app here (see app/back-button.ts).
    <div data-auth-screen className="flex min-h-svh bg-background">
      {wide && <BrandPanel />}
      <div
        data-slot="auth-content"
        className="flex min-h-svh min-w-0 flex-1 flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      >
        <header className="flex items-center justify-end gap-1 px-3 py-2 md:px-6 md:py-4">
          <LanguageMenu />
          <ThemeMenu />
        </header>
        <main className="flex flex-1 justify-center px-5 pb-10 sm:items-center">
          <div className="flex w-full max-w-sm flex-col gap-7">
            {!wide && <GymIdentity />}
            <div className={wide ? 'flex flex-col gap-1.5' : 'flex flex-col gap-1.5 text-center'}>
              <h1 className="text-title font-bold">{title}</h1>
              {description && <p className="text-muted-foreground">{description}</p>}
            </div>
            <div className="flex flex-col gap-4">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}

function useGymName(): string | null {
  const gym = useDeviceGym();
  const { language } = usePreferences();
  return gym ? localizedName(gym, language) : null;
}

/** Phones: the gym's logo and name above the form. */
function GymIdentity() {
  const { t } = useTranslation();
  const gymName = useGymName();
  return (
    <div className="flex flex-col items-center gap-3 pt-2 text-center">
      <GymMark className="size-20 rounded-[1.375rem] shadow-lg" />
      <div className="flex flex-col">
        <span data-testid={gymName ? 'device-gym' : undefined} className="text-xl font-extrabold">
          {gymName ?? t('app.name')}
        </span>
        {gymName && <span className="text-sm text-muted-foreground">{t('app.name')}</span>}
      </div>
    </div>
  );
}

/** Wide screens: the gym's side of the screen, in its brand color with a soft light. */
function BrandPanel() {
  const { t } = useTranslation();
  const gymName = useGymName();
  return (
    <aside
      style={STRONG_BRAND_TOKENS}
      className="relative flex w-[44%] max-w-2xl shrink-0 flex-col justify-between overflow-hidden bg-primary p-12 pt-[calc(env(safe-area-inset-top)+3rem)] text-primary-foreground"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-s-1/4 -top-1/4 size-[80%] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--primary-foreground)_20%,transparent),transparent)]"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-e-1/3 -bottom-1/3 size-[90%] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--primary),black_35%),transparent)]"
      />
      <span className="relative text-sm font-semibold opacity-80">{t('app.fullName')}</span>
      <div className="relative flex flex-col gap-6">
        <GymMark onBrand className="size-28 rounded-[1.75rem] shadow-xl" />
        <div className="flex flex-col gap-2">
          <span
            data-testid={gymName ? 'device-gym' : undefined}
            className="text-4xl leading-tight font-extrabold"
          >
            {gymName ?? t('app.name')}
          </span>
          {gymName && <span className="text-lg opacity-85">{t('app.name')}</span>}
        </div>
      </div>
      <span dir="ltr" className="relative self-end text-xs opacity-60">
        {import.meta.env.VITE_APP_VERSION}
      </span>
    </aside>
  );
}
