import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { TriangleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PaymentErrorKey } from './payment-errors';

/** A failed load or change of money, in words (payments:serverErrors). */
export function PaymentError({ error }: { readonly error: PaymentErrorKey | null }) {
  const { t } = useTranslation('payments');
  if (error === null) return null;
  return (
    <Alert variant="destructive" role="alert">
      <TriangleAlertIcon />
      <AlertDescription>{t(`serverErrors.${error}`)}</AlertDescription>
    </Alert>
  );
}
