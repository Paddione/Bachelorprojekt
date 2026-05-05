// website/src/lib/einvoice/xrechnung.ts
import { generateCII } from './cii';
import { LEITWEG_ID_REGEX, type InvoiceInput } from './types';

export const XRECHNUNG_3_0_PROFILE =
  'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0';

export function generateXRechnung(input: InvoiceInput): string {
  const id = input.buyer.leitwegId;
  if (!id) throw new Error('XRechnung requires a Leitweg-ID on the buyer (BT-10).');
  if (!LEITWEG_ID_REGEX.test(id)) throw new Error(`Invalid Leitweg-ID format: ${id}`);
  return generateCII(input, { profileId: XRECHNUNG_3_0_PROFILE, leitwegId: id });
}
