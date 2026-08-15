// website/src/lib/einvoice/factur-x.ts
import { generateCII } from './cii';
import type { InvoiceInput } from './types';

export const FACTURX_PROFILE_EN16931 = 'urn:cen.eu:en16931:2017';

export function generateFacturX(input: InvoiceInput): string {
  return generateCII(input, { profileId: FACTURX_PROFILE_EN16931 });
}
