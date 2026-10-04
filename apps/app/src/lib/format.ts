import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatTime,
  type Currency,
  type DateInput,
  type DateStyle,
} from '@gym/i18n';
import { useMemo } from 'react';
import { usePreferences } from './preferences';

/** Formatters bound to the current language and digit style. */
export function useFormat() {
  const { language, digits } = usePreferences();
  return useMemo(() => {
    const options = { language, digits };
    return {
      number: (value: number, fractionDigits?: number) =>
        formatNumber(value, { ...options, fractionDigits }),
      money: (amount: number, currency: Currency = 'IQD') => formatMoney(amount, currency, options),
      date: (value: DateInput, style?: DateStyle) => formatDate(value, { ...options, style }),
      time: (value: DateInput) => formatTime(value, options),
      dateTime: (value: DateInput, style?: DateStyle) =>
        formatDateTime(value, { ...options, style }),
    };
  }, [language, digits]);
}
