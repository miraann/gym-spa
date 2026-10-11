import { normalizeAdminEmail } from '@gym/core';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Button } from '@gym/ui/components/button';
import { Field, FieldGroup, FieldLabel } from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { Spinner } from '@gym/ui/components/spinner';
import { isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js';
import { InfoIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useSellerClient } from '@/lib/client';
import { FormMessage } from '@/shell/form-error';
import { AuthLayout } from './auth-layout';
import { useSession, type SignedOutNotice } from './session';

type LoginProblem = 'invalid' | 'banned' | 'tooMany' | 'network';

function loginProblem(error: unknown): LoginProblem {
  if (isAuthRetryableFetchError(error)) return 'network';
  if (isAuthApiError(error)) {
    if (error.code === 'user_banned') return 'banned';
    if (error.status === 429 || error.code === 'over_request_rate_limit') return 'tooMany';
  }
  return 'invalid';
}

/** Email and password (step 1). Gym staff can't get past it: seller_me() refuses them. */
export function LoginScreen({ notice }: { readonly notice: SignedOutNotice | null }) {
  const { t } = useTranslation('seller');
  const client = useSellerClient();
  const { refresh } = useSession();
  const [problem, setProblem] = useState<LoginProblem | null>(null);
  const form = useForm({ defaultValues: { email: '', password: '' } });
  const { isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ email, password }) => {
    setProblem(null);
    const { error } = await client.auth.signInWithPassword({
      email: normalizeAdminEmail(email),
      password,
    });
    if (error) {
      setProblem(loginProblem(error));
      return;
    }
    await refresh();
  });

  const problemText =
    problem === null ? null : problem === 'network' ? t('errors.network') : t(`login.${problem}`);

  return (
    <AuthLayout title={t('login.title')} description={t('login.description')}>
      {notice !== null && (
        <Alert>
          <InfoIcon />
          <AlertDescription>
            {notice === 'idle'
              ? t('common.idleSignedOut')
              : notice === 'no_access'
                ? t('login.noAccess')
                : t('errors.unauthorized')}
          </AlertDescription>
        </Alert>
      )}
      <form noValidate onSubmit={(event) => void submit(event)}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">{t('login.email')}</FieldLabel>
            <Input
              id="email"
              type="email"
              dir="ltr"
              autoComplete="username"
              autoFocus
              required
              {...form.register('email', { required: true })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">{t('login.password')}</FieldLabel>
            <Input
              id="password"
              type="password"
              dir="ltr"
              autoComplete="current-password"
              required
              {...form.register('password', { required: true })}
            />
          </Field>
          <FormMessage text={problemText} />
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting && <Spinner />}
            {t('login.submit')}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  );
}
