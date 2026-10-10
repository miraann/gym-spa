import { TEXT_SIZES } from '@gym/core';
import { CaseSensitiveIcon, LockIcon, TypeIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ChoiceGroup } from '@/components/choice-group';
import { PageHeader } from '@/components/page-header';
import { THEME_CHOICES } from '@/components/theme-choices';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useActiveAccount } from '@/features/auth/auth-context';
import { useChangeTextSize, useChangeTheme } from '@/features/auth/use-change-look';
import { usePermission } from '@/features/auth/use-permissions';
import { usePreferences } from '@/lib/preferences';
import { GymLookCard } from './gym-look-card';

/** Settings → Appearance (spec §6.1): the gym's look, and the staff member's own look. */
export function AppearancePage() {
  const { t } = useTranslation('settings');
  const account = useActiveAccount();
  // One look for the whole gym: saving needs settings.edit and access to all branches.
  const canEditGym = usePermission('settings.edit') && account?.allBranches === true;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('appearance.title')} description={t('appearance.description')} />
      {canEditGym ? (
        <GymLookCard />
      ) : (
        <Alert>
          <LockIcon />
          <AlertDescription>{t('appearance.gym.readOnly')}</AlertDescription>
        </Alert>
      )}
      <PersonalLookCard />
    </div>
  );
}

const TEXT_SIZE_ICONS = { normal: TypeIcon, large: CaseSensitiveIcon } as const;

/** Light / dark / device and text size: the staff member's own, on every device. */
function PersonalLookCard() {
  const { t } = useTranslation(['settings', 'common']);
  const { theme, textSize } = usePreferences();
  const changeTheme = useChangeTheme();
  const changeTextSize = useChangeTextSize();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('appearance.personal.title')}</h2>
        </CardTitle>
        <CardDescription>{t('appearance.personal.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <section className="flex flex-col gap-3" aria-labelledby="personal-theme">
          <div>
            <h3 id="personal-theme">{t('common:theme.label')}</h3>
            <p className="text-sm text-muted-foreground">{t('appearance.personal.themeHint')}</p>
          </div>
          <ChoiceGroup
            label={t('common:theme.label')}
            value={theme}
            choices={THEME_CHOICES.map(({ value, icon }) => ({
              value,
              icon,
              label: t(`common:theme.${value}`),
            }))}
            onChange={changeTheme}
          />
        </section>
        <section className="flex flex-col gap-3" aria-labelledby="personal-text-size">
          <div>
            <h3 id="personal-text-size">{t('appearance.personal.textSize')}</h3>
            <p className="text-sm text-muted-foreground">{t('appearance.personal.textSizeHint')}</p>
          </div>
          <ChoiceGroup
            label={t('appearance.personal.textSize')}
            value={textSize}
            choices={TEXT_SIZES.map((size) => ({
              value: size,
              icon: TEXT_SIZE_ICONS[size],
              label: t(`appearance.personal.${size}`),
            }))}
            onChange={changeTextSize}
          />
        </section>
      </CardContent>
    </Card>
  );
}
