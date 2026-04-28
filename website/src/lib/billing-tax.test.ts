import { describe, expect, it } from 'vitest';
import { deriveSupplyType, isVorsteuerEligible, resolveCustomerTaxCategory } from './billing-tax';

describe('billing-tax', () => {
  it('classifies domestic customers as standard tax', () => {
    expect(resolveCustomerTaxCategory('DE')).toBe('S');
    expect(deriveSupplyType('DE')).toBe('domestic');
  });

  it('classifies EU B2B customers as reverse charge', () => {
    expect(resolveCustomerTaxCategory('FR', 'FR123')).toBe('AE');
    expect(deriveSupplyType('FR', 'FR123')).toBe('eu_b2b');
  });

  it('classifies non-EU customers as export', () => {
    expect(resolveCustomerTaxCategory('US')).toBe('Z');
    expect(deriveSupplyType('US')).toBe('drittland_export');
  });

  it('flags vorsteuer eligibility for EU only', () => {
    expect(isVorsteuerEligible('DE')).toBe(true);
    expect(isVorsteuerEligible('FR')).toBe(true);
    expect(isVorsteuerEligible('US')).toBe(false);
  });
});
