import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Skeleton } from '@gym/ui/components/skeleton';
import { RouterProvider } from '@tanstack/react-router';
import { CircleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LoginScreen } from '@/auth/login-screen';
import { NewPasswordScreen, RecoveryCodesScreen } from '@/auth/password-screens';
import { useSession } from '@/auth/session';
import { TwoStepCheckScreen, TwoStepSetupScreen } from '@/auth/two-step-screens';
import { router } from '@/router';

/** The sign-in step the admin is at, or the panel once they passed every step. */
export function App() {
  const { phase } = useSession();
  switch (phase.kind) {
    case 'loading':
      return (
        <div className="flex min-h-svh items-center justify-center p-4">
          <Skeleton className="h-64 w-full max-w-md rounded-3xl" />
        </div>
      );
    case 'signed_out':
      return <LoginScreen notice={phase.notice} />;
    case 'two_step_check':
      return <TwoStepCheckScreen />;
    case 'new_password':
      return <NewPasswordScreen />;
    case 'two_step_setup':
      return <TwoStepSetupScreen />;
    case 'recovery_codes':
      return <RecoveryCodesScreen codes={phase.codes} email={phase.me.email} />;
    case 'ready':
      return <RouterProvider router={router} />;
  }
}

/** A build without a backend address. */
export function NotConfigured() {
  const { t } = useTranslation('seller');
  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Alert variant="destructive" className="max-w-md">
        <CircleAlertIcon />
        <AlertDescription>{t('errors.network')}</AlertDescription>
      </Alert>
    </div>
  );
}
