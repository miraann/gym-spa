import { describe, expect, it } from 'vitest';
import {
  SHOP_LIMITS,
  addToBasket,
  basketCount,
  basketTotal,
  isLowStock,
  isValidBarcode,
  normalizeBarcode,
  setBasketQuantity,
  type BasketLine,
} from './shop.ts';

describe('barcodes', () => {
  it('normalizes what was typed or scanned', () => {
    expect(normalizeBarcode(' ٦٢٦ 0001 ')).toBe('6260001');
    expect(normalizeBarcode('AB-12.3')).toBe('AB-12.3');
  });

  it('takes 3 to 64 letters, digits, dots and dashes', () => {
    expect(isValidBarcode('6260001')).toBe(true);
    expect(isValidBarcode('AB-12.3')).toBe(true);
    expect(isValidBarcode('12')).toBe(false);
    expect(isValidBarcode('1'.repeat(65))).toBe(false);
    expect(isValidBarcode('12 34')).toBe(false);
    expect(isValidBarcode('ئاو123')).toBe(false);
  });
});

describe('isLowStock', () => {
  it('is low at or below the level', () => {
    expect(isLowStock(5, 5)).toBe(true);
    expect(isLowStock(0, 0)).toBe(true);
    expect(isLowStock(6, 5)).toBe(false);
  });

  it('is never low without a level', () => {
    expect(isLowStock(0, null)).toBe(false);
  });
});

describe('the basket', () => {
  const water: BasketLine = { productId: 'water', quantity: 1, price: 500 };

  it('adds a product, then one more of it', () => {
    const once = addToBasket([], 'water', 500, 3);
    expect(once).toEqual([water]);
    expect(addToBasket(once, 'water', 500, 3)).toEqual([{ ...water, quantity: 2 }]);
  });

  it('never goes beyond the stock', () => {
    expect(addToBasket([{ ...water, quantity: 3 }], 'water', 500, 3)).toEqual([
      { ...water, quantity: 3 },
    ]);
    expect(addToBasket([], 'water', 500, 0)).toEqual([]);
  });

  it('has no stock limit for products that aren’t counted, only the sale limits', () => {
    expect(addToBasket([{ ...water, quantity: 999 }], 'water', 500, null)[0]?.quantity).toBe(1000);
    expect(
      addToBasket([{ ...water, quantity: SHOP_LIMITS.maxQuantity }], 'water', 500, null)[0]
        ?.quantity,
    ).toBe(SHOP_LIMITS.maxQuantity);
    const full = Array.from({ length: SHOP_LIMITS.maxLines }, (_, index) => ({
      productId: String(index),
      quantity: 1,
      price: 1,
    }));
    expect(addToBasket(full, 'water', 500, null)).toHaveLength(SHOP_LIMITS.maxLines);
  });

  it('sets a quantity within 1 and the stock, and takes it out at 0', () => {
    const lines = [water, { productId: 'towel', quantity: 1, price: 1000 }];
    expect(setBasketQuantity(lines, 'water', 9, 4)[0]?.quantity).toBe(4);
    expect(setBasketQuantity(lines, 'water', 2.7, null)[0]?.quantity).toBe(2);
    expect(setBasketQuantity(lines, 'water', 0, 4)).toEqual([lines[1]]);
  });

  it('adds up the total and the count', () => {
    const lines = [
      { ...water, quantity: 2 },
      { productId: 'towel', quantity: 1, price: 1000 },
    ];
    expect(basketTotal(lines)).toBe(2000);
    expect(basketCount(lines)).toBe(3);
    expect(basketTotal([])).toBe(0);
  });
});
