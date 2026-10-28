import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { TriangleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PtErrorKey } from './pt-errors';

/** A failed PT load or change, in words (pt:errors). */
export function PtError({ error }: { readonly error: PtErrorKey | null }) {
  const { t } = useTranslation('pt');
  if (error === null) return null;
  return (
    <Alert variant="destructive" role="alert">
      <TriangleAlertIcon />
      <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
    </Alert>
  );
}
