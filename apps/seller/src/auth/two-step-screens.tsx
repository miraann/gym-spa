import { toLatinDigits } from '@gym/core';
import { Button } from '@gym/ui/components/button';
import { Field, FieldGroup, FieldLabel } from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { Skeleton } from '@gym/ui/components/skeleton';
import { Spinner } from '@gym/ui/components/spinner';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { callSellerAdmin } from '@/lib/api';
import type { SellerClient } from '@/lib/backend';
import { useSellerClient } from '@/lib/client';
import { panelErrorKey, type PanelErrorKey } from '@/lib/errors';
import { FormError, FormMessage } from '@/shell/form-error';
import { AuthLayout } from './auth-layout';
import { useSession } from './session';

/** What a person types for a 6-digit code: digits only, Kurdish and Arabic digits too. */
function cleanCode(input: string): string {
  return toLatinDigits(input).replace(/\D/g, '');
}

function CodeField({
  id,
  label,
  register,
}: {
  readonly id: string;
  readonly label: string;
  readonly register: ReturnType<ReturnType<typeof useForm<{ code: string }>>['register']>;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        dir="ltr"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        maxLength={12}
        className="font-mono text-xl tracking-[0.3em]"
        {...register}
      />
    </Field>
  );
}

async function verifiedFactorId(client: SellerClient): Promise<string | null> {
  const { data } = await client.auth.mfa.listFactors();
  return data?.totp[0]?.id ?? null;
}

/** Step 2: the code from the authenticator app; or a recovery code when the device is lost. */
export function TwoStepCheckScreen() {
  const { t } = useTranslation('seller');
  const [recovery, setRecovery] = useState(false);
  return recovery ? (
    <RecoveryCodeScreen
      onBack={() => {
        setRecovery(false);
      }}
    />
  ) : (
    <TwoStepCodeScreen
      onLostDevice={() => {
        setRecovery(true);
      }}
      title={t('twoStep.checkTitle')}
    />
  );
}

function TwoStepCodeScreen({
  onLostDevice,
  title,
}: {
  readonly onLostDevice: () => void;
  readonly title: string;
}) {
  const { t } = useTranslation('seller');
  const client = useSellerClient();
  const { refresh, signOut } = useSession();
  const [wrong, setWrong] = useState(false);
  const form = useForm({ defaultValues: { code: '' } });
  const { isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ code }) => {
    setWrong(false);
    const factorId = await verifiedFactorId(client);
    if (factorId === null) {
      await refresh();
      return;
    }
    const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code: cleanCode(code) });
    if (error) {
      setWrong(true);
      form.reset({ code: '' });
      return;
    }
    await refresh();
  });

  return (
    <AuthLayout title={title} description={t('twoStep.checkDescription')}>
      <form noValidate onSubmit={(event) => void submit(event)}>
        <FieldGroup>
          <CodeField
            id="two-step-code"
            label={t('twoStep.code')}
            register={form.register('code')}
          />
          <FormMessage text={wrong ? t('twoStep.wrong') : null} />
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting && <Spinner />}
            {t('twoStep.submit')}
          </Button>
          <Button type="button" variant="link" onClick={onLostDevice}>
            {t('twoStep.lostDevice')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => void signOut()}>
            {t('nav.signOut')}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  );
}

/**
 * A recovery code, after the password alone: the seller-admin function checks it (the database
 * uses it up and logs it) and removes the lost device; then the panel sets up a new one.
 */
function RecoveryCodeScreen({ onBack }: { readonly onBack: () => void }) {
  const { t } = useTranslation('seller');
  const client = useSellerClient();
  const { refresh } = useSession();
  const [error, setError] = useState<PanelErrorKey | null>(null);
  const form = useForm({ defaultValues: { code: '' } });
  const { isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ code }) => {
    setError(null);
    try {
      // The database compares letters and digits only (any case, spaces and hyphens ignored).
      await callSellerAdmin(client, {
        action: 'use_recovery_code',
        code: toLatinDigits(code).trim(),
      });
      await refresh();
    } catch (thrown) {
      setError(panelErrorKey(thrown));
    }
  });

  return (
    <AuthLayout title={t('recovery.useTitle')} description={t('recovery.useDescription')}>
      <form noValidate onSubmit={(event) => void submit(event)}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="recovery-code">{t('recovery.code')}</FieldLabel>
            <Input
              id="recovery-code"
              dir="ltr"
              autoComplete="off"
              autoFocus
              spellCheck={false}
              className="font-mono text-lg tracking-wider"
              placeholder="xxxx-xxxx-xxxx-xxxx"
              {...form.register('code', { required: true })}
            />
          </Field>
          <FormError error={error} />
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting && <Spinner />}
            {t('recovery.submit')}
          </Button>
          <Button type="button" variant="ghost" onClick={onBack}>
            {t('common.back')}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  );
}

interface Enrollment {
  readonly factorId: string;
  readonly qr: string;
  readonly secret: string;
}

/** The QR code as an image URL (Auth gives SVG markup, or already a data URL). */
function qrSource(qr: string): string {
  return qr.startsWith('data:') ? qr : `data:image/svg+xml;utf-8,${encodeURIComponent(qr)}`;
}

/** Groups of 4, so the key can be read and typed. */
function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Step 4: a new authenticator device. Leftover unverified devices (an earlier, unfinished setup)
 * are removed first; Auth allows that before the second step.
 */
export function TwoStepSetupScreen() {
  const { t } = useTranslation('seller');
  const client = useSellerClient();
  const { afterTwoStepSetup, signOut } = useSession();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [error, setError] = useState<PanelErrorKey | null>(null);
  const [wrong, setWrong] = useState(false);
  const started = useRef<Promise<void> | null>(null);
  const form = useForm({ defaultValues: { code: '' } });
  const { isSubmitting } = form.formState;

  useEffect(() => {
    // Once per screen, also under React's StrictMode double effects.
    started.current ??= (async () => {
      const listed = await client.auth.mfa.listFactors();
      for (const factor of listed.data?.all ?? []) {
        if (factor.factor_type === 'totp' && factor.status === 'unverified') {
          await client.auth.mfa.unenroll({ factorId: factor.id });
        }
      }
      const { data, error: enrollError } = await client.auth.mfa.enroll({ factorType: 'totp' });
      if (enrollError) {
        setError('unexpected');
        return;
      }
      setEnrollment({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    })();
  }, [client]);

  const submit = form.handleSubmit(async ({ code }) => {
    if (enrollment === null) return;
    setWrong(false);
    setError(null);
    const { error: verifyError } = await client.auth.mfa.challengeAndVerify({
      factorId: enrollment.factorId,
      code: cleanCode(code),
    });
    if (verifyError) {
      setWrong(true);
      form.reset({ code: '' });
      return;
    }
    try {
      await afterTwoStepSetup();
    } catch (thrown) {
      setError(panelErrorKey(thrown));
    }
  });

  return (
    <AuthLayout title={t('twoStep.setupTitle')} description={t('twoStep.setupDescription')}>
      {enrollment === null ? (
        <Skeleton className="mx-auto size-52 rounded-2xl" />
      ) : (
        <div className="flex flex-col items-center gap-3">
          <img
            src={qrSource(enrollment.qr)}
            alt={t('twoStep.qr')}
            className="size-52 rounded-2xl bg-white p-2"
          />
          <p className="text-sm text-muted-foreground">{t('twoStep.secret')}</p>
          <code
            dir="ltr"
            data-testid="totp-secret"
            className="rounded-xl bg-muted px-3 py-2 font-mono text-sm break-all select-all"
          >
            {groupSecret(enrollment.secret)}
          </code>
        </div>
      )}
      <form noValidate onSubmit={(event) => void submit(event)}>
        <FieldGroup>
          <CodeField id="setup-code" label={t('twoStep.code')} register={form.register('code')} />
          <FormMessage text={wrong ? t('twoStep.wrong') : null} />
          <FormError error={error} />
          <Button type="submit" size="lg" disabled={isSubmitting || enrollment === null}>
            {isSubmitting && <Spinner />}
            {t('twoStep.submit')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => void signOut()}>
            {t('nav.signOut')}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  );
}
