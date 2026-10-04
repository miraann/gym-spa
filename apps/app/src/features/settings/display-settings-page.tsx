import { LANGUAGE_CODES, LANGUAGES, localizeDigits, type Digits } from '@gym/i18n';
import { useTranslation } from 'react-i18next';
import { ChoiceGroup } from '@/components/choice-group';
import { PageHeader } from '@/components/page-header';
import { THEME_CHOICES } from '@/components/theme-choices';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFormat } from '@/lib/format';
import { setPreference, usePreferences } from '@/lib/preferences';

const DIGIT_STYLES: readonly Digits[] = ['latn', 'arab'];

export function DisplaySettingsPage() {
  const { t } = useTranslation(['settings', 'common']);
  const preferences = usePreferences();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title={t('display.title')} description={t('display.description')} />

      <SettingCard title={t('common:language.label')} description={t('display.languageHint')}>
        <ChoiceGroup
          label={t('common:language.label')}
          value={preferences.language}
          choices={LANGUAGE_CODES.map((code) => ({
            value: code,
            label: LANGUAGES[code].nativeName,
            lang: code,
          }))}
          onChange={(language) => {
            setPreference('language', language);
          }}
        />
      </SettingCard>

      <SettingCard title={t('common:digits.label')} description={t('display.digitsHint')}>
        <ChoiceGroup
          label={t('common:digits.label')}
          value={preferences.digits}
          choices={DIGIT_STYLES.map((digits) => ({
            value: digits,
            label: t(`common:digits.${digits}`),
            sample: localizeDigits('123', digits),
          }))}
          onChange={(digits) => {
            setPreference('digits', digits);
          }}
        />
      </SettingCard>

      <SettingCard title={t('common:theme.label')} description={t('display.themeHint')}>
        <ChoiceGroup
          label={t('common:theme.label')}
          value={preferences.theme}
          choices={THEME_CHOICES.map(({ value, icon }) => ({
            value,
            icon,
            label: t(`common:theme.${value}`),
          }))}
          onChange={(theme) => {
            setPreference('theme', theme);
          }}
        />
      </SettingCard>

      <FormatPreview />
    </div>
  );
}

function SettingCard({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function FormatPreview() {
  const { t } = useTranslation('settings');
  const format = useFormat();
  const now = new Date();

  const rows = [
    { label: t('display.previewNumber'), value: format.number(1234567) },
    { label: t('display.previewIqd'), value: format.money(25000, 'IQD') },
    { label: t('display.previewUsd'), value: format.money(12.5, 'USD') },
    { label: t('display.previewDate'), value: format.date(now, 'full') },
    { label: t('display.previewTime'), value: format.time(now) },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('display.previewTitle')}</CardTitle>
        <CardDescription>{t('display.previewHint')}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[auto_1fr]">
          {rows.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-sm text-muted-foreground">{row.label}</dt>
              <dd className="font-medium tabular-nums">{row.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
