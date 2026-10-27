import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { TriangleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CheckinErrorKey } from './checkin-errors';

/** A failed check-in, check-out or void, in words (checkin:errors). */
export function CheckinError({ error }: { readonly error: CheckinErrorKey | null }) {
  const { t } = useTranslation('checkin');
  if (error === null) return null;
  return (
    <Alert variant="destructive" role="alert">
      <TriangleAlertIcon />
      <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
    </Alert>
  );
}
