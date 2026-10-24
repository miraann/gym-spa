import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { TriangleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PlanErrorKey } from './plan-errors';

/** A failed load or change of the plans screen, in words (plans:errors). */
export function PlanError({ error }: { readonly error: PlanErrorKey | null }) {
  const { t } = useTranslation('plans');
  if (error === null) return null;
  return (
    <Alert variant="destructive" role="alert">
      <TriangleAlertIcon />
      <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
    </Alert>
  );
}
