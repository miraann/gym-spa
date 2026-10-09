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
