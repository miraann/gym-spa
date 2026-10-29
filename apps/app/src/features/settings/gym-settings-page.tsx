import { RECEIPT_FOOTER_MAX, SETTINGS, toLatinDigits } from '@gym/core';
import { LANGUAGE_CODES, LANGUAGES, getDirection, type Language } from '@gym/i18n';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Button } from '@gym/ui/components/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { Skeleton } from '@gym/ui/components/skeleton';
import { TriangleAlertIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { RequirePermission } from '@/components/no-access';
import { ExportAllData } from '@/features/backup/export-section';
import { useAdminWriteState } from '@/features/staff/write-state';
import { useGymSettings, useSaveGymSettings, type GymSettings } from './gym-settings-data';

/** Settings → جیم (settings.edit): the receipt's bottom line and the usual dollar rate. */
export function GymSettingsPage() {
  return (
    <RequirePermission permission="settings.edit">
      <GymSettingsLoader />
    </RequirePermission>
  );
}

function GymSettingsLoader() {
  const { t } = useTranslation('settings');
  const settings = useGymSettings();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('gym.title')} description={t('gym.description')} />
      {settings.isPending ? (
        <Skeleton className="h-80 w-full rounded-2xl" />
      ) : settings.isError ? (
        <Alert variant="destructive" role="alert">
          <TriangleAlertIcon />
          <AlertDescription>{t('gym.loadFailed')}</AlertDescription>
        </Alert>
      ) : (
        <GymSettingsForm settings={settings.data} />
      )}
      <ExportAllData />
    </div>
  );
}

function GymSettingsForm({ settings }: { readonly settings: GymSettings }) {
  const { t } = useTranslation('settings');
  const id = useId();
  const { online, readOnly } = useAdminWriteState();
  const save = useSaveGymSettings();
  const [footer, setFooter] = useState<Record<Language, string>>({ ...settings.footer });
  const [rate, setRate] = useState(settings.usdRate === 0 ? '' : String(settings.usdRate));
  const rateValue = rate.trim() === '' ? 0 : Number(toLatinDigits(rate.trim()).replace(/,/g, ''));
  const rule = SETTINGS['payments.usd_rate'];
  const rateProblem = !Number.isInteger(rateValue) || rateValue < rule.min || rateValue > rule.max;

  return (
    <form
      className="flex flex-col gap-6 rounded-card bg-card p-4 shadow-sm ring-1 ring-foreground/6 md:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (rateProblem) return;
        save.mutate(
          { footer, usdRate: rateValue },
          {
            onSuccess: () => {
              toast.success(t('gym.saved'));
            },
            onError: () => {
              toast.error(t('gym.saveFailed'));
            },
          },
        );
      }}
    >
      <FieldGroup>
        <h2 className="text-lg">{t('gym.footerTitle')}</h2>
        <p className="-mt-2 text-sm text-muted-foreground">{t('gym.footerHint')}</p>
        {LANGUAGE_CODES.map((language) => (
          <Field key={language}>
            <FieldLabel htmlFor={`${id}-${language}`}>{LANGUAGES[language].nativeName}</FieldLabel>
            <Input
              id={`${id}-${language}`}
              lang={language}
              dir={getDirection(language)}
              value={footer[language]}
              maxLength={RECEIPT_FOOTER_MAX}
              onChange={(event) => {
                setFooter((current) => ({ ...current, [language]: event.target.value }));
              }}
            />
          </Field>
        ))}
      </FieldGroup>
      <Field data-invalid={rateProblem || undefined}>
        <FieldLabel htmlFor={`${id}-rate`}>{t('gym.usdRate')}</FieldLabel>
        <Input
          id={`${id}-rate`}
          dir="ltr"
          inputMode="numeric"
          className="md:w-48"
          value={rate}
          aria-invalid={rateProblem || undefined}
          onChange={(event) => {
            setRate(event.target.value);
          }}
        />
        <FieldDescription>{t('gym.usdRateHint')}</FieldDescription>
        {rateProblem && <FieldError>{t('gym.usdRateInvalid')}</FieldError>}
      </Field>
      <Button type="submit" className="self-start" disabled={!online || readOnly || save.isPending}>
        {t('gym.save')}
      </Button>
    </form>
  );
}
