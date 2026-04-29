const EU_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR',
  'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
]);

export function resolveCustomerTaxCategory(
  landIso: string,
  vatNumber?: string,
): 'S' | 'AE' | 'Z' {
  const iso = (landIso || 'DE').toUpperCase();
  if (iso === 'DE') return 'S';
  if (EU_COUNTRIES.has(iso)) return vatNumber?.trim() ? 'AE' : 'S';
  return 'Z';
}

export function isVorsteuerEligible(landIso: string): boolean {
  const iso = (landIso || 'DE').toUpperCase();
  return iso === 'DE' || EU_COUNTRIES.has(iso);
}

export function deriveSupplyType(
  landIso: string,
  vatNumber?: string,
): 'domestic' | 'eu_b2b' | 'drittland_export' {
  const cat = resolveCustomerTaxCategory(landIso, vatNumber);
  if (cat === 'AE') return 'eu_b2b';
  if (cat === 'Z') return 'drittland_export';
  return 'domestic';
}
