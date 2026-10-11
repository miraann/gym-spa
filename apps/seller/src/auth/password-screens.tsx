import { ADMIN_MIN_PASSWORD_LENGTH, adminPasswordProblem } from '@gym/core';
import { CopyableSecret } from '@gym/ui/blocks/copyable-secret';
import { Button } from '@gym/ui/components/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { Spinner } from '@gym/ui/components/spinner';
import { zodResolver } from '@hookform/resolvers/zod';
import { isAuthApiError } from '@supabase/supabase-js';
import { DownloadIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useSellerClient } from '@/lib/client';
import { useFormat } from '@/lib/format';
import { FormMessage } from '@/shell/form-error';
import { AuthLayout } from './auth-layout';
import { useSession } from './session';

// Messages are keys of seller:newPassword.
const schema = z
  .object({ password: z.string(), confirm: z.string() })
  .superRefine(({ password, confirm }, context) => {
    const problem = adminPasswordProblem(password);
    if (problem) {
      context.addIssue({
        code: 'custom',
        path: ['password'],
        message: problem === 'password_short' ? 'short' : 'long',
      });
    } else if (password !== confirm) {
      context.addIssue({ code: 'custom', path: ['confirm'], message: 'mismatch' });
    }
  });
type Values = z.infer<typeof schema>;
const MESSAGES = ['short', 'long', 'mismatch', 'same', 'weak'] as const;
type Message = (typeof MESSAGES)[number];

/** A new password of their own: the form (also used on the account page). */
export function NewPasswordForm({ onDone }: { readonly onDone: () => Promise<void> | void }) {
  const { t } = useTranslation('seller');
  const client = useSellerClient();
  const format = useFormat();
  const [problem, setProblem] = useState<Message | 'network' | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  });
  const { errors, isSubmitting } = form.formState;
  const min = format.number(ADMIN_MIN_PASSWORD_LENGTH);
  const message = (key: string | undefined) => {
    const known = MESSAGES.find((each): each is Message => each === key);
    return known ? t(`newPassword.${known}`, { min }) : null;
  };

  const submit = form.handleSubmit(async ({ password }) => {
    setProblem(null);
    const { error } = await client.auth.updateUser({ password });
    if (error) {
      if (isAuthApiError(error) && error.code === 'same_password') setProblem('same');
      else if (isAuthApiError(error) && error.code === 'weak_password') setProblem('weak');
      else setProblem('network');
      return;
    }
    form.reset();
    await onDone();
  });

  return (
    <form noValidate onSubmit={(event) => void submit(event)}>
      <FieldGroup>
        <Field data-invalid={Boolean(errors.password)}>
          <FieldLabel htmlFor="new-password">{t('newPassword.password')}</FieldLabel>
          <Input
            id="new-password"
            type="password"
            dir="ltr"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.password)}
            {...form.register('password')}
          />
          {errors.password ? (
            <FieldError>{message(errors.password.message)}</FieldError>
          ) : (
            <FieldDescription>{t('newPassword.short', { min })}</FieldDescription>
          )}
        </Field>
        <Field data-invalid={Boolean(errors.confirm)}>
          <FieldLabel htmlFor="confirm-password">{t('newPassword.confirm')}</FieldLabel>
          <Input
            id="confirm-password"
            type="password"
            dir="ltr"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.confirm)}
            {...form.register('confirm')}
          />
          <FieldError>{message(errors.confirm?.message)}</FieldError>
        </Field>
        <FormMessage
          text={
            problem === null
              ? null
              : problem === 'network'
                ? t('errors.network')
                : t(`newPassword.${problem}`)
          }
        />
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting && <Spinner />}
          {t('newPassword.submit')}
        </Button>
      </FieldGroup>
    </form>
  );
}

/** Step 3: someone else chose their password. Changing it clears must_change_password. */
export function NewPasswordScreen() {
  const { t } = useTranslation('seller');
  const { refresh } = useSession();
  return (
    <AuthLayout title={t('newPassword.title')} description={t('newPassword.description')}>
      <NewPasswordForm onDone={refresh} />
    </AuthLayout>
  );
}

/** The codes as a text file, for a password manager or an encrypted USB copy. */
function downloadCodes(codes: readonly string[], header: string): void {
  const blob = new Blob([`${header}\n\n${codes.join('\n')}\n`], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'clickgroup-recovery-codes.txt';
  link.click();
  URL.revokeObjectURL(url);
}

/** Recovery codes, shown once (step 5, and from the account page). */
export function RecoveryCodesPanel({
  codes,
  email,
}: {
  readonly codes: readonly string[];
  readonly email: string;
}) {
  const { t } = useTranslation('seller');
  return (
    <CopyableSecret
      value={codes.join('\n')}
      texts={{
        label: t('recovery.label'),
        copy: t('recovery.copy'),
        copied: t('recovery.copied'),
        copyFailed: t('recovery.copyFailed'),
        shownOnce: t('recovery.shownOnce'),
      }}
      actions={
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => {
            downloadCodes(codes, t('recovery.fileHeader', { email }));
          }}
        >
          <DownloadIcon data-icon="inline-start" />
          {t('recovery.download')}
        </Button>
      }
    />
  );
}

export function RecoveryCodesScreen({
  codes,
  email,
}: {
  readonly codes: readonly string[];
  readonly email: string;
}) {
  const { t } = useTranslation('seller');
  const { codesSaved } = useSession();
  return (
    <AuthLayout title={t('recovery.showTitle')} description={t('recovery.showDescription')}>
      <RecoveryCodesPanel codes={codes} email={email} />
      <Button type="button" size="lg" onClick={codesSaved}>
        {t('recovery.saved')}
      </Button>
    </AuthLayout>
  );
}
