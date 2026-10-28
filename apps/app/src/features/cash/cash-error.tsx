import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { TriangleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CashErrorKey } from './cash-errors';

/** A failed cash register load or change, in words (cash:errors). */
export function CashError({ error }: { readonly error: CashErrorKey | null }) {
  const { t } = useTranslation('cash');
  if (error === null) return null;
  return (
    <Alert variant="destructive" role="alert">
      <TriangleAlertIcon />
      <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
    </Alert>
  );
}
