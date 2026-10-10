import { zodResolver } from '@hookform/resolvers/zod';
import { EyeIcon, EyeOffIcon, WifiOffIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useConnection } from '@/lib/connection';
import { useAuthController, useAuthState } from '../auth-context';
import type { AuthStep } from '../auth-controller';
import { authErrorKey, type AuthErrorKey } from '../staff-api';
import { AuthLayout } from './auth-layout';
import { AuthErrorMessage } from './form-error';

// Zod messages are translation keys (validation.*), shown with t().
type ValidationKey = 'gym_code_required' | 'username_required' | 'password_required';
const VALIDATION_KEYS: readonly string[] = [
  'gym_code_required',
  'username_required',
  'password_required',
] satisfies readonly ValidationKey[];

function isValidationKey(message: string | undefined): message is ValidationKey {
  return message !== undefined && VALIDATION_KEYS.includes(message);
}

const loginSchema = z.object({
  // Only asked on a device's first login (checked in submit); afterwards the device knows its gym.
  gymCode: z.string(),
  username: z.string().trim().min(1, 'username_required'),
  password: z.string().min(1, 'password_required'),
});
type LoginValues = z.infer<typeof loginSchema>;

/**
 * Username and password login (online only). On a device's first login it asks for the gym code
 * too (a `?gym=` link fills it in); after that the device remembers its gym.
 */
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
  const { gym, accounts } = useAuthState();
  const askGymCode = gym === null;
  const { state: connection } = useConnection();
  const online = connection !== 'offline' && connection !== 'unreachable';
  const [error, setError] = useState<AuthErrorKey | null>(
    controller.configured ? null : 'not_configured',
  );
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      gymCode: controller.linkedGymCode ?? '',
      username: username ?? '',
      password: '',
    },
  });
  const { errors, isSubmitting } = form.formState;
  const message = (key: string | undefined) =>
    isValidationKey(key) ? t(`validation.${key}`) : null;
  const gymCodeMissing = askGymCode && form.getValues('gymCode') === '';

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    if (askGymCode && values.gymCode.trim() === '') {
      form.setError('gymCode', { message: 'gym_code_required' }, { shouldFocus: true });
      return;
    }
    try {
      onStep(
        await controller.passwordLogin(
          askGymCode ? values.gymCode : null,
          values.username,
          values.password,
        ),
      );
    } catch (thrown) {
      const key = authErrorKey(thrown, 'login');
      // One message for a wrong gym code, username or password: it never says which.
      setError(key === 'invalid_credentials' && askGymCode ? 'invalid_gym_credentials' : key);
      form.resetField('password');
    }
  });

  return (
    <AuthLayout
      title={t('login.title')}
      description={askGymCode ? t('login.descriptionFirst') : t('login.description')}
    >
      {!online && (
        <Alert>
          <WifiOffIcon />
          <AlertDescription>{t('login.offline')}</AlertDescription>
        </Alert>
      )}
      <form noValidate onSubmit={(event) => void submit(event)}>
        <FieldGroup>
          {askGymCode && (
            <Field data-invalid={Boolean(errors.gymCode)}>
              <FieldLabel htmlFor="login-gym-code">{t('login.gymCode')}</FieldLabel>
              <Input
                id="login-gym-code"
                dir="ltr"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus={gymCodeMissing}
                aria-invalid={Boolean(errors.gymCode)}
                aria-describedby="login-gym-code-hint"
                {...form.register('gymCode')}
              />
              <FieldDescription id="login-gym-code-hint">{t('login.gymCodeHint')}</FieldDescription>
              <FieldError>{message(errors.gymCode?.message)}</FieldError>
            </Field>
          )}
          <Field data-invalid={Boolean(errors.username)}>
            <FieldLabel htmlFor="login-username">{t('login.username')}</FieldLabel>
            <Input
              id="login-username"
              dir="ltr"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus={!username && !gymCodeMissing}
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
          {/* Everyone on a device belongs to its gym, so the gym changes only on an empty device. */}
          {!askGymCode && accounts.length === 0 && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setError(null);
                void controller.forgetGym();
              }}
            >
              {t('login.useAnotherGym')}
            </Button>
          )}
        </FieldGroup>
      </form>
    </AuthLayout>
  );
}
