import { describe, it, expect } from 'vitest';
import { stripe } from './stripe';

describe('stripe (legacy stub)', () => {
  it('is exported as null (the Stripe SDK was removed in favor of native billing)', () => {
    expect(stripe).toBeNull();
  });
});
