import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));

const mockQuery = vi.fn();
vi.mock('../../../../../lib/website-db', () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
}));

const mockValidate = vi.fn();
vi.mock('../../../../../lib/einvoice/sidecar-client', () => ({
  createSidecarClient: vi.fn().mockReturnValue({
    validate: (...args: any[]) => mockValidate(...args),
  }),
  sidecarBaseUrlFromEnv: vi.fn().mockReturnValue('http://sidecar'),
}));

import { getSession, isAdmin } from '../../../../../lib/auth';
import { POST } from './validate';

const mockSession = { user: { id: 'admin1' } };

describe('POST /api/admin/billing/[id]/validate', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue(mockSession as any);
    vi.mocked(isAdmin).mockReturnValue(true);
    mockQuery.mockReset();
    mockValidate.mockReset();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await POST({ request: new Request('http://localhost'), params: { id: 'inv1' } } as any);
    expect(res.status).toBe(401);
  });

  it('returns 404 when invoice has no PDF/A-3 blob', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ pdf_a3_blob: null }] });
    const res = await POST({ request: new Request('http://localhost'), params: { id: 'inv1' } } as any);
    expect(res.status).toBe(404);
  });

  it('calls sidecar validate and updates invoice', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ pdf_a3_blob: Buffer.from('pdf') }] });
    mockValidate.mockResolvedValueOnce({ valid: true, report: 'OK' });
    mockQuery.mockResolvedValueOnce({ rowCount: 1 }); // UPDATE

    const res = await POST({ request: new Request('http://localhost'), params: { id: 'inv1' } } as any);
    expect(res.status).toBe(200);
    expect(mockValidate).toHaveBeenCalledWith({ pdf: Buffer.from('pdf') });
    expect(mockQuery).toHaveBeenCalledTimes(2);
    
    const data = await res.json();
    expect(data).toEqual({ valid: true, report: 'OK' });
  });
});
