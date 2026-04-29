const ECB_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';

export type RateMap = Record<string, number>;

export async function fetchEcbRates(): Promise<RateMap> {
  const res = await fetch(ECB_URL, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`ECB rate fetch failed: ${res.status}`);
  const xml = await res.text();
  const map: RateMap = { EUR: 1 };
  for (const m of xml.matchAll(/currency="([A-Z]{3})" rate="([\d.]+)"/g)) {
    map[m[1]] = 1 / parseFloat(m[2]);
  }
  return map;
}

export function eurPer(currency: string, rates: RateMap): number {
  if (currency === 'EUR') return 1;
  const r = rates[currency];
  if (r === undefined) throw new Error(`No ECB rate for ${currency}`);
  return r;
}
