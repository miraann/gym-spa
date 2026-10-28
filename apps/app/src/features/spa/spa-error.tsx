import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { TriangleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SpaErrorKey } from './spa-errors';

/** A failed spa load or change, in words (spa:errors). */
export function SpaError({ error }: { readonly error: SpaErrorKey | null }) {
  const { t } = useTranslation('spa');
  if (error === null) return null;
  return (
    <Alert variant="destructive" role="alert">
      <TriangleAlertIcon />
      <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
    </Alert>
  );
}
