import { describe, it, expect } from 'vitest';
import { amountMatches, currencyExponent, formatAmount, toMajorUnits, toMinorUnits } from '../../src/core/payment/money';

describe('currency exponents', () => {
  it('treats most currencies as two-decimal', () => {
    expect(currencyExponent('USD')).toBe(2);
    expect(currencyExponent('EUR')).toBe(2);
    // Stripe bills IDR in sen even though Indonesians never quote them.
    expect(currencyExponent('IDR')).toBe(2);
  });

  it('knows the zero-decimal currencies', () => {
    for (const code of ['JPY', 'KRW', 'VND', 'XOF', 'CLP']) {
      expect(currencyExponent(code)).toBe(0);
    }
  });

  it('knows the three-decimal currencies', () => {
    for (const code of ['BHD', 'JOD', 'KWD', 'OMR', 'TND']) {
      expect(currencyExponent(code)).toBe(3);
    }
  });

  it('is case-insensitive', () => {
    expect(currencyExponent('jpy')).toBe(0);
  });
});

describe('minor unit conversion', () => {
  it('multiplies two-decimal currencies by 100', () => {
    expect(toMinorUnits(55, 'USD')).toBe(5500);
    expect(toMinorUnits(55.55, 'USD')).toBe(5555);
  });

  it('leaves zero-decimal currencies alone', () => {
    // The classic 100x overcharge: yen must not be multiplied.
    expect(toMinorUnits(5000, 'JPY')).toBe(5000);
  });

  it('multiplies three-decimal currencies by 1000', () => {
    expect(toMinorUnits(12.5, 'KWD')).toBe(12500);
  });

  it('rounds rather than truncating floating point drift', () => {
    // 19.99 * 100 is 1998.9999999999998 in IEEE 754.
    expect(toMinorUnits(19.99, 'USD')).toBe(1999);
  });

  it('round-trips back to major units', () => {
    expect(toMajorUnits(toMinorUnits(149.99, 'EUR'), 'EUR')).toBeCloseTo(149.99, 5);
    expect(toMajorUnits(toMinorUnits(5000, 'JPY'), 'JPY')).toBe(5000);
  });
});

describe('formatAmount', () => {
  it('renders the decimals each gateway expects', () => {
    expect(formatAmount(55, 'USD')).toBe('55.00');
    expect(formatAmount(5000, 'JPY')).toBe('5000');
    expect(formatAmount(12.5, 'KWD')).toBe('12.500');
  });
});

describe('amountMatches', () => {
  it('accepts an exact match', () => {
    expect(amountMatches(55, 55, 'USD')).toBe(true);
  });

  it('tolerates one minor unit of provider rounding', () => {
    expect(amountMatches(55, 55.01, 'USD')).toBe(true);
  });

  it('rejects a materially different amount', () => {
    expect(amountMatches(55, 5.5, 'USD')).toBe(false);
    expect(amountMatches(55, 55.5, 'USD')).toBe(false);
  });

  it('scales tolerance to the currency', () => {
    // One yen is a whole unit, so a one-unit gap is still within tolerance...
    expect(amountMatches(5000, 5001, 'JPY')).toBe(true);
    // ...but two is not.
    expect(amountMatches(5000, 5002, 'JPY')).toBe(false);
  });
});
