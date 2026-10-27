// Arabic-Indic (٠-٩, used with Arabic and Kurdish keyboards) and Extended Arabic-Indic (۰-۹).
const EASTERN_DIGITS = /[٠-٩۰-۹]/g;

function toLatinDigit(digit: string): string {
  const code = digit.codePointAt(0) ?? 0;
  return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
}

/** Turns digits typed on a Kurdish or Arabic keyboard (٠-٩, ۰-۹) into 0-9. */
export function toLatinDigits(input: string): string {
  return input.replace(EASTERN_DIGITS, toLatinDigit);
}

/** Thousands separators people type or paste in an amount: commas, spaces, the Arabic ٬. */
const THOUSANDS_SEPARATORS = /[,\s\u066C\u00A0\u202F]/g;

/**
 * A whole number as typed (25,000 or ٢٥٬٠٠٠), or null when it isn't one (empty, a fraction, a
 * sign, letters).
 */
export function parseWholeNumber(input: string): number | null {
  const digits = toLatinDigits(input).replace(THOUSANDS_SEPARATORS, '');
  if (!/^[0-9]{1,15}$/.test(digits)) return null;
  return Number(digits);
}

/**
 * A number with up to `maxDecimals` decimals as typed (1,310.5 or ١٣١٠٫٥: the decimal point may be
 * . or the Arabic ٫), or null when it isn't one.
 */
export function parseDecimal(input: string, maxDecimals = 2): number | null {
  const text = toLatinDigits(input).replace(THOUSANDS_SEPARATORS, '').replace('٫', '.');
  if (!new RegExp(`^[0-9]{1,12}([.][0-9]{1,${String(maxDecimals)}})?$`).test(text)) return null;
  return Number(text);
}
