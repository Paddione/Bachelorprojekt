import { pool, initBillingTables } from './website-db';

const VIES_URL = 'https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number';

export interface ViesResult {
  valid: boolean;
  name?: string;
  address?: string;
  requestIdentifier?: string;
  validatedAt: string;
}

export function parseVatIdCountry(vatId: string): string {
  if (!/^[A-Z]{2}/.test(vatId)) throw new Error('Invalid VAT ID format');
  return vatId.slice(0, 2);
}

export async function checkViesVatId(p: {
  vatId: string;
  requesterVatId?: string;
  customerId?: string;
}): Promise<ViesResult> {
  const cc = parseVatIdCountry(p.vatId);
  const vatNumber = p.vatId.slice(2);
  const body: Record<string, string> = { countryCode: cc, vatNumber };
  if (p.requesterVatId) {
    body.requesterCountryCode = parseVatIdCountry(p.requesterVatId);
    body.requesterVatNumber = p.requesterVatId.slice(2);
  }

  const res = await fetch(VIES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`VIES check failed: ${res.status}`);
  const data = await res.json() as {
    isValid: boolean; name?: string; address?: string; requestIdentifier?: string;
  };

  const result: ViesResult = {
    valid: data.isValid,
    name: data.name ?? undefined,
    address: data.address ?? undefined,
    requestIdentifier: data.requestIdentifier ?? undefined,
    validatedAt: new Date().toISOString(),
  };

  if (p.customerId) {
    await initBillingTables();
    await pool.query(
      `INSERT INTO vat_id_validations
         (customer_id, vat_id, country_code, valid, vies_name, vies_address, request_identifier)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [p.customerId, p.vatId, cc, data.isValid,
       data.name ?? null, data.address ?? null, data.requestIdentifier ?? null],
    );
  }

  return result;
}

export async function getLatestVatValidation(customerId: string): Promise<ViesResult | null> {
  await initBillingTables();
  const r = await pool.query(
    `SELECT * FROM vat_id_validations WHERE customer_id=$1 ORDER BY validated_at DESC LIMIT 1`,
    [customerId],
  );
  if (!r.rows[0]) return null;
  const row = r.rows[0];
  return {
    valid: Boolean(row.valid),
    name: row.vies_name ?? undefined,
    address: row.vies_address ?? undefined,
    requestIdentifier: row.request_identifier ?? undefined,
    validatedAt: row.validated_at.toISOString(),
  };
}
