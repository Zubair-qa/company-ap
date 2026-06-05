import {
  hasUsableStripeSecret,
  toStripeMinorUnits,
} from './stripe-amount.util';

describe('Stripe amount utilities', () => {
  it('converts PKR to minor units', () => {
    expect(toStripeMinorUnits('425000', 'pkr')).toBe(42500000);
    expect(toStripeMinorUnits('99.50', 'pkr')).toBe(9950);
  });

  it('keeps zero-decimal currencies as whole units', () => {
    expect(toStripeMinorUnits('1200', 'jpy')).toBe(1200);
  });

  it('rejects invalid fractional precision', () => {
    expect(() => toStripeMinorUnits('10.001', 'pkr')).toThrow(
      'too many decimal places',
    );
  });

  it('detects placeholder Stripe secrets', () => {
    expect(hasUsableStripeSecret('sk_test_123')).toBe(true);
    expect(hasUsableStripeSecret('sk_test_...')).toBe(false);
    expect(hasUsableStripeSecret('sk_test_replace_me')).toBe(false);
    expect(hasUsableStripeSecret(undefined)).toBe(false);
  });
});
