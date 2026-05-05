import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../../lib/auth', () => ({
  getSession: () => ({ user: { is_admin: true } }),
  isAdmin: () => true,
}));
vi.mock('../../../../../lib/native-billing', () => ({
  getInvoiceForEInvoice: async (id: string) => id === 'inv-1' ? {
    invoice: { number: 'RE-1', issueDate: '2026-04-28', dueDate: '2026-05-12',
               grossAmount: 119, netAmount: 100, taxAmount: 19,
               taxMode: 'regelbesteuerung', taxRate: 19, paymentReference: 'RG1' },
    lines: [{ description: 'Beratung', quantity: 1, unitPrice: 100, unit: 'HUR' }],
    customer: { name: 'X', email: 'x@y.de', leitwegId: '991-01234-44',
                addressLine1: 'A', postalCode: '1', city: 'B', country: 'DE' },
    seller: { name: 'mentolder', address: 'H1', postalCode: '54321', city: 'Köln',
              country: 'DE', vatId: 'DE123456789', iban: 'DE02120300000000202051',
              email: 'rechnung@mentolder.de' },
  } : null,
}));

const { GET } = await import('./zugferd');

const req = (url: string) => ({ request: new Request(url, { headers: { cookie: '' } }), params: { id: 'inv-1' } } as never);

describe('GET /api/billing/invoice/:id/zugferd', () => {
  it('default = factur-x-minimum', async () => {
    const r = await GET(req('https://x/?'));
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Disposition')).toContain('factur-x-RE-1.xml');
  });
  it('?profile=xrechnung-cii returns XRechnung CII', async () => {
    const r = await GET(req('https://x/?profile=xrechnung-cii'));
    expect(r.headers.get('Content-Disposition')).toContain('xrechnung-cii-RE-1.xml');
    expect(await r.text()).toContain('xrechnung_3.0');
  });
  it('?profile=xrechnung-ubl returns UBL', async () => {
    const r = await GET(req('https://x/?profile=xrechnung-ubl'));
    expect(await r.text()).toContain('<Invoice');
  });
  it('rejects unknown profile', async () => {
    const r = await GET(req('https://x/?profile=garbage'));
    expect(r.status).toBe(400);
  });
});
