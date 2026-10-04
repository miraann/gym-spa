import type { Language } from './languages';
import { resources } from './resources';

export type Digits = 'latn' | 'arab';
export type Currency = 'IQD' | 'USD';
export type DateStyle = 'short' | 'long' | 'full';
export type DateInput = Date | string | number;

export const TIME_ZONE = 'Asia/Baghdad';

export interface FormatOptions {
  readonly language: Language;
  readonly digits: Digits;
}

const CURRENCY_FRACTION_DIGITS: Readonly<Record<Currency, number>> = { IQD: 0, USD: 2 };
const ARABIC_INDIC_ZERO = 0x0660;

/** Replaces Western digits with Eastern Arabic ones (٠١٢٣٤٥٦٧٨٩) when that style is selected. */
export function localizeDigits(text: string, digits: Digits): string {
  if (digits === 'latn') return text;
  return text.replace(/[0-9]/g, (digit) => String.fromCharCode(ARABIC_INDIC_ZERO + Number(digit)));
}

const numberFormats = new Map<string, Intl.NumberFormat>();

function getNumberFormat(digits: Digits, fractionDigits: number | undefined): Intl.NumberFormat {
  const key = `${digits}:${String(fractionDigits)}`;
  let format = numberFormats.get(key);
  if (!format) {
    // A fixed base locale gives the same output on every platform (Chromium, Android WebView,
    // Node): `ckb` locale data differs between ICU builds. Only the digit shapes vary.
    format = new Intl.NumberFormat('en-US', {
      numberingSystem: digits,
      minimumFractionDigits: fractionDigits ?? 0,
      maximumFractionDigits: fractionDigits ?? 2,
    });
    numberFormats.set(key, format);
  }
  return format;
}

export function formatNumber(
  value: number,
  options: FormatOptions & { readonly fractionDigits?: number },
): string {
  return getNumberFormat(options.digits, options.fractionDigits).format(value);
}

/** IQD has no decimals (`25,000 د.ع`); USD always shows 2. */
export function formatMoney(amount: number, currency: Currency, options: FormatOptions): string {
  const value = getNumberFormat(options.digits, CURRENCY_FRACTION_DIGITS[currency]).format(amount);
  return interpolate(resources[options.language].common.money[currency], { amount: value });
}

export function formatDate(
  input: DateInput,
  options: FormatOptions & { readonly style?: DateStyle },
): string {
  const { language, digits, style = 'long' } = options;
  const locale = resources[language].dates;
  const { year, month, day } = getBaghdadParts(input);

  if (style === 'short') {
    const text = interpolate(locale.patterns.short, {
      day: pad2(day),
      month: pad2(month),
      year: String(year),
    });
    return localizeDigits(text, digits);
  }

  const long = interpolate(locale.patterns.long, {
    day: String(day),
    month: locale.months[month - 1] ?? String(month),
    year: String(year),
  });
  if (style === 'long') return localizeDigits(long, digits);

  const weekdayIndex = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const full = interpolate(locale.patterns.full, {
    weekday: locale.weekdays[weekdayIndex] ?? '',
    date: long,
  });
  return localizeDigits(full, digits);
}

/** 12-hour clock with the language's AM/PM words, in Baghdad time. */
export function formatTime(input: DateInput, options: FormatOptions): string {
  const locale = resources[options.language].dates;
  const { hour, minute } = getBaghdadParts(input);
  const text = interpolate(locale.patterns.time, {
    hour: String(hour % 12 === 0 ? 12 : hour % 12),
    minute: pad2(minute),
    period: hour < 12 ? locale.periods.am : locale.periods.pm,
  });
  return localizeDigits(text, options.digits);
}

export function formatDateTime(
  input: DateInput,
  options: FormatOptions & { readonly style?: DateStyle },
): string {
  return interpolate(resources[options.language].dates.patterns.dateTime, {
    date: formatDate(input, options),
    time: formatTime(input, options),
  });
}

interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const baghdadParts = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
});

function getBaghdadParts(input: DateInput): DateParts {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid date: ${String(input)}`);
  }
  const parts: DateParts = { year: 0, month: 0, day: 0, hour: 0, minute: 0 };
  for (const { type, value } of baghdadParts.formatToParts(date)) {
    switch (type) {
      case 'year':
      case 'month':
      case 'day':
      case 'hour':
      case 'minute':
        parts[type] = Number(value);
        break;
      default:
        break;
    }
  }
  return parts;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function interpolate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match);
}
