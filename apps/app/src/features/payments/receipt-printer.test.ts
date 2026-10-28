import { describe, expect, it } from 'vitest';
import { DEFAULT_RECEIPT_PRINTER, parseReceiptPrinter } from './receipt-printer';

describe('parseReceiptPrinter', () => {
  it('reads a saved printer', () => {
    expect(parseReceiptPrinter('{"name":"XP-80C","silent":true}')).toEqual({
      name: 'XP-80C',
      silent: true,
    });
  });

  it('never prints silently without a printer', () => {
    expect(parseReceiptPrinter('{"name":null,"silent":true}')).toEqual(DEFAULT_RECEIPT_PRINTER);
    expect(parseReceiptPrinter('{"name":"","silent":true}')).toEqual(DEFAULT_RECEIPT_PRINTER);
  });

  it('falls back to the default for anything else', () => {
    expect(parseReceiptPrinter(null)).toEqual(DEFAULT_RECEIPT_PRINTER);
    expect(parseReceiptPrinter('not json')).toEqual(DEFAULT_RECEIPT_PRINTER);
    expect(parseReceiptPrinter('{"name":42}')).toEqual(DEFAULT_RECEIPT_PRINTER);
  });
});
