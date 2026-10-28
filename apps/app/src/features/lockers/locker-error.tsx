import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { TriangleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LockerErrorKey } from './locker-errors';

/** A failed locker action, in words (lockers:errors). */
export function LockerError({ error }: { readonly error: LockerErrorKey | null }) {
  const { t } = useTranslation('lockers');
  if (error === null) return null;
  return (
    <Alert variant="destructive" role="alert">
      <TriangleAlertIcon />
      <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
    </Alert>
  );
}
