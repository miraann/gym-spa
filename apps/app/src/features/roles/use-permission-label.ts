import { discountLimit, type PermissionKey } from '@gym/core';
import { useTranslation } from 'react-i18next';
import { useFormat } from '@/lib/format';

/** A permission's label in the current language; discount limits show their percentage. */
export function usePermissionLabel(): (key: PermissionKey) => string {
  const { t } = useTranslation('permissions');
  const format = useFormat();
  return (key) => {
    const limit = discountLimit(key);
    return t(`items.${key}`, { max: limit === null ? '' : format.number(limit) });
  };
}
