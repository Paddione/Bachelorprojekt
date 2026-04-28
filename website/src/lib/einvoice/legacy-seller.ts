export interface LegacySellerConfig {
  name: string; address: string; postalCode: string; city: string; country: string; vatId: string;
}

export function sellerConfigFromEnv(): LegacySellerConfig {
  return {
    name:       process.env.SELLER_NAME        || process.env.BRAND_NAME || 'Unbekannt',
    address:    process.env.SELLER_ADDRESS     || '',
    postalCode: process.env.SELLER_POSTAL_CODE || '',
    city:       process.env.SELLER_CITY        || '',
    country:    process.env.SELLER_COUNTRY     || 'DE',
    vatId:      process.env.SELLER_VAT_ID      || '',
  };
}
