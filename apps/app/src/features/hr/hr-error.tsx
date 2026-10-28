import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { TriangleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { HrErrorKey } from './hr-errors';

/** A failed HR load or change, in words (hr:errors). */
export function HrError({ error }: { readonly error: HrErrorKey | null }) {
  const { t } = useTranslation('hr');
  if (error === null) return null;
  return (
    <Alert variant="destructive" role="alert">
      <TriangleAlertIcon />
      <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
    </Alert>
  );
}
