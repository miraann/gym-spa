import { describe, expect, it } from 'vitest';
import { isPrinterName } from './desktop-bridge';

describe('isPrinterName', () => {
  it('takes the names Windows gives printers', () => {
    expect(isPrinterName('XP-80C')).toBe(true);
    expect(isPrinterName('Microsoft Print to PDF')).toBe(true);
    expect(isPrinterName(String.raw`\\server\receipts`)).toBe(true);
  });

  it('refuses anything else', () => {
    expect(isPrinterName('')).toBe(false);
    expect(isPrinterName('a'.repeat(257))).toBe(false);
    expect(isPrinterName('XP\n80')).toBe(false);
    expect(isPrinterName(String.fromCharCode(0))).toBe(false);
    expect(isPrinterName(42)).toBe(false);
    expect(isPrinterName(null)).toBe(false);
  });
});
