import { formatDate, formatDateTime, formatMoney, formatNumber, type DateInput } from '@gym/i18n';
import { useMemo } from 'react';
import { usePreferences } from './preferences';

/** Formatters for the current language (Latin digits, Baghdad time, Sorani month names). */
export function useFormat() {
  const { language } = usePreferences();
  return useMemo(() => {
    const options = { language, digits: 'latn' as const };
    return {
      number: (value: number) => formatNumber(value, options),
      money: (amount: number) => formatMoney(amount, 'IQD', options),
      date: (value: DateInput) => formatDate(value, options),
      dateTime: (value: DateInput) => formatDateTime(value, { ...options, style: 'short' }),
    };
  }, [language]);
}
