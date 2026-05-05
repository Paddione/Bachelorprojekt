import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));

const mockQuery = vi.fn();
vi.mock('../../../../../lib/website-db', () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
}));

import { getSession, isAdmin } from '../../../../../lib/auth';
import { GET } from './xrechnung.xml';

const mockSession = { user: { id: 'admin1' } };

describe('GET /api/billing/invoice/[id]/xrechnung.xml', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue(mockSession as any);
    vi.mocked(isAdmin).mockReturnValue(true);
    mockQuery.mockReset();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await GET({ request: new Request('http://localhost'), params: { id: 'inv1' } } as any);
    expect(res.status).toBe(401);
  });

  it('returns 404 when invoice not found', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });
    const res = await GET({ request: new Request('http://localhost'), params: { id: 'inv1' } } as any);
    expect(res.status).toBe(404);
  });

  it('returns 404 when invoice has no XRechnung XML', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ xrechnung_xml: null, number: 'INV-1' }] });
    const res = await GET({ request: new Request('http://localhost'), params: { id: 'inv1' } } as any);
    expect(res.status).toBe(404);
  });

  it('returns XML when available', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ xrechnung_xml: '<xml>xr</xml>', number: 'INV-1' }] });
    const res = await GET({ request: new Request('http://localhost'), params: { id: 'inv1' } } as any);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/xml');
    expect(res.headers.get('Content-Disposition')).toContain('attachment; filename="xrechnung-INV-1.xml"');
    expect(await res.text()).toBe('<xml>xr</xml>');
  });
});
