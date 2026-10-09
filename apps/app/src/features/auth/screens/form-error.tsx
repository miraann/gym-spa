import { CircleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { AuthErrorKey } from '../staff-api';

export function FormError({ message }: { readonly message: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="destructive" role="alert">
      <CircleAlertIcon />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/** Shows an AuthErrorKey in the current language. */
export function AuthErrorMessage({ error }: { readonly error: AuthErrorKey | null }) {
  const { t } = useTranslation('auth');
  return <FormError message={error ? t(`errors.${error}`) : null} />;
}
