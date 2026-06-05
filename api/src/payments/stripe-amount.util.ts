const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif',
  'clp',
  'djf',
  'gnf',
  'jpy',
  'kmf',
  'krw',
  'mga',
  'pyg',
  'rwf',
  'ugx',
  'vnd',
  'vuv',
  'xaf',
  'xof',
  'xpf',
]);

export function toStripeMinorUnits(
  amount: { toString(): string } | string | number,
  currency: string,
) {
  const normalizedCurrency = currency.toLowerCase();
  const decimals = ZERO_DECIMAL_CURRENCIES.has(normalizedCurrency) ? 0 : 2;
  const value = typeof amount === 'number' ? String(amount) : amount.toString();
  const trimmed = value.trim();

  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error('Invalid payment amount');
  }

  const [whole, fraction = ''] = trimmed.split('.');
  if (fraction.length > decimals) {
    throw new Error(`Amount has too many decimal places for ${normalizedCurrency}`);
  }

  const paddedFraction = fraction.padEnd(decimals, '0');
  const minorUnits = Number(`${whole}${paddedFraction}`);

  if (!Number.isSafeInteger(minorUnits) || minorUnits <= 0) {
    throw new Error('Invalid payment amount');
  }

  return minorUnits;
}

export function hasUsableStripeSecret(key: string | undefined) {
  if (!key) return false;
  return key.startsWith('sk_') && !key.includes('...') && !key.includes('replace_me');
}
