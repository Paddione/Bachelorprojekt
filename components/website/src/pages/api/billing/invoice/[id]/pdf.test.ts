import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../../lib/auth', () => ({
  getSession: () => ({ user: { is_admin: true }, email: 'admin@x.de' }),
  isAdmin: () => true,
}));
vi.mock('../../../../../lib/native-billing', () => ({
  getInvoiceForEInvoice: async () => ({
    invoice: { number: 'RE-9', issueDate: '2026-04-28', dueDate: '2026-05-12',
               grossAmount: 119, netAmount: 100, taxAmount: 19,
               taxMode: 'regelbesteuerung', taxRate: 19, paymentReference: 'RG9' },
    lines: [{ description: 'X', quantity: 1, unitPrice: 100 }],
    customer: { name: 'C', email: 'c@d.de', leitwegId: '991-01234-44',
                addressLine1: 'A', postalCode: '1', city: 'B', country: 'DE' },
    seller: { name: 'mentolder', address: 'A', postalCode: '1', city: 'K',
              country: 'DE', vatId: 'DE1', iban: 'DE02120300000000202051',
              email: 'rechnung@mentolder.de' },
  }),
}));
const archiveBlob = Buffer.from('%PDF-archived-blob%');
vi.mock('../../../../../lib/website-db', () => ({
  pool: { query: async () => ({ rows: [{ pdf_blob: archiveBlob, pdf_mime: 'application/pdf',
                                          number: 'RE-9', customer_email: 'c@d.de' }] }) },
  initBillingTables: async () => {},
}));

const { GET } = await import('./pdf');
const req = (url: string) => ({ request: new Request(url, { headers: { cookie: '' } }), params: { id: 'inv-1' } } as never);

describe('GET /api/billing/invoice/:id/pdf', () => {
  it('without profile: returns the archived blob byte-identically', async () => {
    const r = await GET(req('https://x/?'));
    expect(r.status).toBe(200);
    const buf = Buffer.from(await r.arrayBuffer());
    expect(buf.equals(archiveBlob)).toBe(true);
  });
  it('with ?profile=factur-x-minimum: regenerates fresh PDF/A-3 with embedded factur-x.xml', async () => {
    const r = await GET(req('https://x/?profile=factur-x-minimum'));
    expect(r.status).toBe(200);
    const buf = Buffer.from(await r.arrayBuffer());
    expect(buf.equals(archiveBlob)).toBe(false);
    expect(buf.toString('latin1')).toContain('factur-x.xml');
  }, 30_000);
  it('with ?profile=xrechnung-cii: regenerates with xrechnung.xml attachment', async () => {
    const r = await GET(req('https://x/?profile=xrechnung-cii'));
    const buf = Buffer.from(await r.arrayBuffer());
    expect(buf.toString('latin1')).toContain('xrechnung.xml');
  }, 30_000);
  it('rejects unknown profile', async () => {
    const r = await GET(req('https://x/?profile=garbage'));
    expect(r.status).toBe(400);
  });
});
