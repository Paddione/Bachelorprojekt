import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));

const mockQuery = vi.fn();
vi.mock('../../../../lib/website-db', () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
  initBillingTables: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../lib/sepa-pain008', () => ({
  buildPain008: vi.fn().mockReturnValue('<xml>sepa</xml>'),
  validateMandates: vi.fn((rows) => ({ valid: rows, skipped: [] })),
}));

import { getSession, isAdmin } from '../../../../lib/auth';
import { GET } from './sepa-export';

const mockSession = { user: { id: 'admin1' } };

describe('GET /api/admin/billing/sepa-export', () => {
  let envBackup: any;

  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue(mockSession as any);
    vi.mocked(isAdmin).mockReturnValue(true);
    mockQuery.mockReset();
    envBackup = { ...process.env };
    process.env.SEPA_CREDITOR_IBAN = 'DE123456';
    process.env.SEPA_CREDITOR_BIC = 'TESTBIC';
    process.env.SEPA_CREDITOR_ID = 'DE98ZZZ0000';
  });

  afterEach(() => {
    process.env = envBackup;
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await GET({ request: new Request('http://localhost'), url: new URL('http://localhost') } as any);
    expect(res.status).toBe(401);
  });

  it('returns 503 when SEPA env vars are missing', async () => {
    delete process.env.SEPA_CREDITOR_IBAN;
    const res = await GET({ request: new Request('http://localhost'), url: new URL('http://localhost') } as any);
    expect(res.status).toBe(503);
  });

  it('returns 400 when date is invalid', async () => {
    const res = await GET({ request: new Request('http://localhost'), url: new URL('http://localhost?date=invalid') } as any);
    expect(res.status).toBe(400);
  });

  it('returns 404 when no open invoices found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await GET({ request: new Request('http://localhost'), url: new URL('http://localhost?date=2026-05-01') } as any);
    expect(res.status).toBe(404);
  });

  it('returns SEPA XML for valid invoices', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          number: 'INV-01',
          gross_amount: '119.00',
          paid_amount: '0.00',
          customer_name: 'Test Customer',
          sepa_iban: 'DE123',
          sepa_bic: 'BIC',
          sepa_mandate_ref: 'REF1',
          sepa_mandate_date: new Date('2026-01-01'),
        }
      ]
    });
    
    const res = await GET({ request: new Request('http://localhost'), url: new URL('http://localhost?date=2026-05-01') } as any);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/xml');
    expect(res.headers.get('Content-Disposition')).toContain('attachment; filename="sepa-lastschrift-2026-05-01.xml"');
    const text = await res.text();
    expect(text).toBe('<xml>sepa</xml>');
  });
});
