import { zodResolver } from '@hookform/resolvers/zod';
import { EyeIcon, EyeOffIcon, WifiOffIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useConnection } from '@/lib/connection';
import { useAuthController } from '../auth-context';
import type { AuthStep } from '../auth-controller';
import { authErrorKey, type AuthErrorKey } from '../staff-api';
import { AuthLayout } from './auth-layout';
import { AuthErrorMessage } from './form-error';

// Zod messages are translation keys (validation.*), shown with t().
const loginSchema = z.object({
  username: z.string().trim().min(1, 'username_required'),
  password: z.string().min(1, 'password_required'),
});
type LoginValues = z.infer<typeof loginSchema>;
type ValidationKey = 'username_required' | 'password_required';

function isValidationKey(message: string | undefined): message is ValidationKey {
  return message === 'username_required' || message === 'password_required';
}

/** Username and password login (online only). */
export function LoginScreen({
  username,
  onBack,
  onStep,
}: {
  readonly username?: string;
  /** Back to the staff list; absent when nobody has logged in on this device yet. */
  readonly onBack?: () => void;
  readonly onStep: (step: AuthStep) => void;
}) {
  const { t } = useTranslation('auth');
  const controller = useAuthController();
  const { state: connection } = useConnection();
  const online = connection !== 'offline' && connection !== 'unreachable';
  const [error, setError] = useState<AuthErrorKey | null>(
    controller.configured ? null : 'not_configured',
  );
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: username ?? '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;
  const message = (key: string | undefined) =>
    isValidationKey(key) ? t(`validation.${key}`) : null;

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      onStep(await controller.passwordLogin(values.username, values.password));
    } catch (thrown) {
      setError(authErrorKey(thrown, 'login'));
      form.resetField('password');
    }
  });

  return (
    <AuthLayout title={t('login.title')} description={t('login.description')}>
      {!online && (
        <Alert>
          <WifiOffIcon />
          <AlertDescription>{t('login.offline')}</AlertDescription>
        </Alert>
      )}
      <form noValidate onSubmit={(event) => void submit(event)}>
        <FieldGroup>
          <Field data-invalid={Boolean(errors.username)}>
            <FieldLabel htmlFor="login-username">{t('login.username')}</FieldLabel>
            <Input
              id="login-username"
              dir="ltr"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus={!username}
              aria-invalid={Boolean(errors.username)}
              {...form.register('username')}
            />
            <FieldError>{message(errors.username?.message)}</FieldError>
          </Field>
          <Field data-invalid={Boolean(errors.password)}>
            <FieldLabel htmlFor="login-password">{t('login.password')}</FieldLabel>
            <div className="relative">
              <Input
                id="login-password"
                dir="ltr"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                autoFocus={Boolean(username)}
                aria-invalid={Boolean(errors.password)}
                className="pe-10"
                {...form.register('password')}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute end-1 top-1/2 -translate-y-1/2"
                aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                aria-pressed={showPassword}
                onClick={() => {
                  setShowPassword(!showPassword);
                }}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </Button>
            </div>
            <FieldError>{message(errors.password?.message)}</FieldError>
          </Field>
          <AuthErrorMessage error={error} />
          <Button type="submit" disabled={isSubmitting || !online || !controller.configured}>
            {isSubmitting && <Spinner />}
            {t('login.submit')}
          </Button>
          {onBack && (
            <Button type="button" variant="ghost" onClick={onBack}>
              {t('login.backToStaff')}
            </Button>
          )}
        </FieldGroup>
      </form>
    </AuthLayout>
  );
}
