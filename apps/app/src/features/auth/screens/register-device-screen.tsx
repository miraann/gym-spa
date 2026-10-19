import { localizedName } from '@gym/i18n';
import { Button } from '@gym/ui/components/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { Label } from '@gym/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@gym/ui/components/radio-group';
import { Spinner } from '@gym/ui/components/spinner';
import { isCleanText, normalizeName } from '@gym/core';
import { InfoIcon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { useAuthController } from '../auth-context';
import type { AuthStep } from '../auth-controller';
import { authErrorKey, type AuthErrorKey, type BranchChoice, type GymLimits } from '../staff-api';
import { AuthLayout } from './auth-layout';
import { AuthErrorMessage } from './form-error';

/** The longest device name (devices.name). */
const DEVICE_NAME_MAX_LENGTH = 60;

/**
 * Registering this device (تۆمارکردنی ئامێر), once, by a staff member with devices.manage: a name,
 * and the branch it works in. It counts toward the gym's device limit.
 */
export function RegisterDeviceScreen({
  staffId,
  branches,
  onStep,
}: {
  readonly staffId: string;
  readonly branches: readonly BranchChoice[];
  readonly onStep: (step: AuthStep) => void;
}) {
  const { t } = useTranslation('auth');
  const { language } = usePreferences();
  const format = useFormat();
  const controller = useAuthController();
  const id = useId();
  const [name, setName] = useState('');
  const [branchId, setBranchId] = useState(branches.length === 1 ? (branches[0]?.id ?? '') : '');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthErrorKey | null>(null);
  const [limits, setLimits] = useState<GymLimits | null>(null);

  useEffect(() => {
    let current = true;
    controller
      .gymLimits(staffId)
      .then((found) => {
        if (current) setLimits(found);
      })
      // Only a hint: the server refuses a device over the limit anyway.
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [controller, staffId]);

  const cleanName = normalizeName(name);
  const nameValid = isCleanText(cleanName, DEVICE_NAME_MAX_LENGTH);

  const submit = () => {
    setSubmitted(true);
    if (!nameValid || branchId === '') return;
    setBusy(true);
    setError(null);
    controller
      .registerDevice(staffId, branchId, cleanName)
      .then(onStep)
      .catch((thrown: unknown) => {
        setError(authErrorKey(thrown, 'register-device'));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <AuthLayout title={t('device.title')} description={t('device.description')}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Field data-invalid={submitted && !nameValid}>
          <FieldLabel htmlFor={`${id}-name`}>{t('device.name')}</FieldLabel>
          <Input
            id={`${id}-name`}
            value={name}
            placeholder={t('device.namePlaceholder')}
            autoComplete="off"
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
          {submitted && !nameValid && <FieldError>{t('device.nameError')}</FieldError>}
        </Field>
        <Field data-invalid={submitted && branchId === ''}>
          <FieldLabel id={`${id}-branch`}>{t('device.branch')}</FieldLabel>
          <RadioGroup
            aria-labelledby={`${id}-branch`}
            value={branchId}
            onValueChange={setBranchId}
            className="flex flex-col gap-2"
          >
            {branches.map((branch) => (
              <Label
                key={branch.id}
                htmlFor={`${id}-${branch.id}`}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border p-3 font-normal has-data-[state=checked]:border-primary has-data-[state=checked]:bg-muted"
              >
                <RadioGroupItem id={`${id}-${branch.id}`} value={branch.id} />
                <span className="flex-1">{localizedName(branch, language)}</span>
                <span dir="ltr" className="text-xs text-muted-foreground">
                  {branch.code}
                </span>
              </Label>
            ))}
          </RadioGroup>
          {submitted && branchId === '' && <FieldError>{t('device.branchError')}</FieldError>}
        </Field>
        <FieldDescription className="flex items-start gap-2">
          <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {t('device.limitNote')}
            {limits?.maxDevices != null &&
              ` ${t('device.used', {
                used: format.number(limits.activeDevices),
                max: format.number(limits.maxDevices),
              })}`}
          </span>
        </FieldDescription>
        <AuthErrorMessage error={error} />
        <Button type="submit" size="lg" disabled={busy}>
          {busy && <Spinner />}
          {t('device.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}
