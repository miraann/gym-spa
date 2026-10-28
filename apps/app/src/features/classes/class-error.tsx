import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { TriangleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ClassErrorKey } from './class-errors';

/** A failed class load or change, in words (classes:errors). */
export function ClassError({ error }: { readonly error: ClassErrorKey | null }) {
  const { t } = useTranslation('classes');
  if (error === null) return null;
  return (
    <Alert variant="destructive" role="alert">
      <TriangleAlertIcon />
      <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
    </Alert>
  );
}
