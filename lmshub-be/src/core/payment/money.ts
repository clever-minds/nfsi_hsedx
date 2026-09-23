/**
 * Currency helpers.
 *
 * Most gateways charge in the currency's smallest unit ("minor units"), but
 * they disagree on how many decimals a currency has. Getting this wrong
 * silently charges 100x too much, so the exponent tables below are explicit
 * rather than assumed.
 */

/** Currencies with no subunit — the amount is already in minor units. */
const ZERO_DECIMAL = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG',
  'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);

/** Currencies with three decimals. */
const THREE_DECIMAL = new Set(['BHD', 'JOD', 'KWD', 'OMR', 'TND']);

export function currencyExponent(currency: string): number {
  const code = currency.toUpperCase();
  if (ZERO_DECIMAL.has(code)) return 0;
  if (THREE_DECIMAL.has(code)) return 3;
  return 2;
}

/** Major units → minor units (e.g. 55.00 USD → 5500). */
export function toMinorUnits(amount: number, currency: string): number {
  return Math.round(amount * 10 ** currencyExponent(currency));
}

/** Minor units → major units (e.g. 5500 USD → 55.00). */
export function toMajorUnits(minor: number, currency: string): number {
  return minor / 10 ** currencyExponent(currency);
}

/** Decimal string a REST body can carry verbatim (e.g. "55.00", "150000"). */
export function formatAmount(amount: number, currency: string): string {
  return amount.toFixed(currencyExponent(currency));
}

/**
 * Does the charged amount match what we asked for? Webhooks are the only
 * proof of payment we accept, so a mismatched amount must never settle an
 * order. A one-minor-unit tolerance absorbs provider-side rounding.
 */
export function amountMatches(expected: number, actual: number, currency: string): boolean {
  const exp = currencyExponent(currency);
  return Math.abs(expected - actual) < 1.5 / 10 ** exp;
}
