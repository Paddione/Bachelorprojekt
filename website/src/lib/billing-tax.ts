const EU_COUNTRIES = new Set([
  'AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI',
  'FR','GR','HR','HU','IE','IT','LT','LU','LV','MT',
  'NL','PL','PT','RO','SE','SI','SK',
]);

export function resolveCustomerTaxCategory(
  landIso: string,
  vatNumber: string | undefined,
): 'S' | 'AE' | 'Z' {
  if (landIso === 'DE') return 'S';
  if (EU_COUNTRIES.has(landIso)) return vatNumber ? 'AE' : 'S';
  return 'Z';
}

export function isVorsteuerEligible(landIso: string): boolean {
  return EU_COUNTRIES.has(landIso);
}
