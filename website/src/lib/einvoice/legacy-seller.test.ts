import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sellerConfigFromEnv } from './legacy-seller';

describe('legacy-seller', () => {
  let envBackup: any;

  beforeEach(() => {
    envBackup = { ...process.env };
  });

  afterEach(() => {
    process.env = envBackup;
  });

  it('reads config from env vars', () => {
    process.env.SELLER_NAME = 'Test Seller';
    process.env.SELLER_ADDRESS = 'Test Street 1';
    process.env.SELLER_POSTAL_CODE = '12345';
    process.env.SELLER_CITY = 'Test City';
    process.env.SELLER_COUNTRY = 'DE';
    process.env.SELLER_VAT_ID = 'DE123456789';

    const config = sellerConfigFromEnv();
    expect(config).toEqual({
      name: 'Test Seller',
      address: 'Test Street 1',
      postalCode: '12345',
      city: 'Test City',
      country: 'DE',
      vatId: 'DE123456789',
    });
  });

  it('falls back to BRAND_NAME or defaults if env vars are missing', () => {
    delete process.env.SELLER_NAME;
    process.env.BRAND_NAME = 'My Brand';
    delete process.env.SELLER_ADDRESS;
    delete process.env.SELLER_POSTAL_CODE;
    delete process.env.SELLER_CITY;
    delete process.env.SELLER_COUNTRY;
    delete process.env.SELLER_VAT_ID;

    const config = sellerConfigFromEnv();
    expect(config).toEqual({
      name: 'My Brand',
      address: '',
      postalCode: '',
      city: '',
      country: 'DE',
      vatId: '',
    });
  });
});
