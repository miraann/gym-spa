import { MIN_PASSWORD_LENGTH, newPasswordProblem } from '@gym/core';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useFormat } from '@/lib/format';
import { useAuthController } from '../auth-context';
import type { AuthStep } from '../auth-controller';
import { authErrorKey, type AuthErrorKey } from '../staff-api';
import { AuthLayout } from './auth-layout';
import { AuthErrorMessage } from './form-error';

const PROBLEMS = ['password_short', 'password_long', 'password_mismatch'] as const;
type Problem = (typeof PROBLEMS)[number];

// Messages are translation keys (validation.*).
const schema = z
  .object({ password: z.string(), confirm: z.string() })
  .superRefine(({ password, confirm }, context) => {
    const problem = newPasswordProblem(password);
    if (problem) context.addIssue({ code: 'custom', path: ['password'], message: problem });
    else if (password !== confirm) {
      context.addIssue({ code: 'custom', path: ['confirm'], message: 'password_mismatch' });
    }
  });
type Values = z.infer<typeof schema>;

/** The forced password change after a manager set or reset the password. */
export function ChangePasswordScreen({
  staffId,
  onStep,
}: {
  readonly staffId: string;
  readonly onStep: (step: AuthStep) => void;
}) {
  const { t } = useTranslation('auth');
  const format = useFormat();
  const controller = useAuthController();
  const [error, setError] = useState<AuthErrorKey | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  });
  const { errors, isSubmitting } = form.formState;
  const min = format.number(MIN_PASSWORD_LENGTH);
  const message = (key: string | undefined) => {
    const problem = PROBLEMS.find((each): each is Problem => each === key);
    return problem ? t(`validation.${problem}`, { min }) : null;
  };

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const step = await controller.changePassword(staffId, values.password);
      toast.success(t('changePassword.changed'));
      onStep(step);
    } catch (thrown) {
      setError(authErrorKey(thrown, 'change-password'));
    }
  });

  return (
    <AuthLayout title={t('changePassword.title')} description={t('changePassword.description')}>
      <form noValidate onSubmit={(event) => void submit(event)}>
        <FieldGroup>
          <Field data-invalid={Boolean(errors.password)}>
            <FieldLabel htmlFor="new-password">{t('changePassword.newPassword')}</FieldLabel>
            <Input
              id="new-password"
              type="password"
              dir="ltr"
              autoComplete="new-password"
              autoFocus
              aria-invalid={Boolean(errors.password)}
              {...form.register('password')}
            />
            {errors.password ? (
              <FieldError>{message(errors.password.message)}</FieldError>
            ) : (
              <FieldDescription>{t('changePassword.hint', { min })}</FieldDescription>
            )}
          </Field>
          <Field data-invalid={Boolean(errors.confirm)}>
            <FieldLabel htmlFor="confirm-password">
              {t('changePassword.confirmPassword')}
            </FieldLabel>
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
          <AuthErrorMessage error={error} />
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Spinner />}
            {t('changePassword.submit')}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  );
}
