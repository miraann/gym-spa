import { CircleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { isOfflineEdition } from '@/lib/edition';
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

/** Shows an AuthErrorKey in the current language; the offline edition speaks of its license. */
export function AuthErrorMessage({ error }: { readonly error: AuthErrorKey | null }) {
  const { t } = useTranslation('auth');
  const key = isOfflineEdition && error === 'gym_read_only' ? 'gym_read_only_offline' : error;
  return <FormError message={key ? t(`errors.${key}`) : null} />;
}
