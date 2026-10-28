import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { TriangleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ShopErrorKey } from './shop-errors';

/** A failed shop load or change, in words (shop:errors). */
export function ShopError({ error }: { readonly error: ShopErrorKey | null }) {
  const { t } = useTranslation('shop');
  if (error === null) return null;
  return (
    <Alert variant="destructive" role="alert">
      <TriangleAlertIcon />
      <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
    </Alert>
  );
}
