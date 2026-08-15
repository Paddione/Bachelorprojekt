import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../../../lib/auth', () => ({
  getSession: () => ({ user: { is_admin: true } }),
  isAdmin: () => true,
}));
let lastSet: { id: string; raw: string | null } | null = null;
vi.mock('../../../../../../lib/native-billing', () => ({
  setBillingCustomerLeitwegId: async (id: string, raw: string | null) => {
    lastSet = { id, raw };
    if (raw === null) return { ok: true, value: null };
    if (!/^[0-9]{2,3}-[0-9A-Z]+(-[0-9A-Z]+)?$/.test(raw.toUpperCase())) return { ok: false, reason: 'Format ungültig' };
    return { ok: true, value: raw.toUpperCase() };
  },
}));

const { PATCH } = await import('./leitweg');
const req = (id: string, body: unknown) => ({
  request: new Request(`https://x/${id}`, { method: 'PATCH', headers: { cookie: '', 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  params: { id },
} as never);

describe('PATCH /api/admin/billing/customers/:id/leitweg', () => {
  it('happy path: stores valid Leitweg-ID', async () => {
    const r = await PATCH(req('cust-1', { leitwegId: '991-01234-44' }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ leitwegId: '991-01234-44' });
    expect(lastSet).toEqual({ id: 'cust-1', raw: '991-01234-44' });
  });
  it('null body: clears Leitweg-ID', async () => {
    const r = await PATCH(req('cust-1', { leitwegId: null }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ leitwegId: null });
  });
  it('invalid format: 422 with reason', async () => {
    const r = await PATCH(req('cust-1', { leitwegId: 'not-valid' }));
    expect(r.status).toBe(422);
    expect((await r.json()).error).toMatch(/Format/);
  });
  it('missing id: 400', async () => {
    const r = await PATCH({ request: new Request('https://x/', { method: 'PATCH', body: '{}' }), params: {} } as never);
    expect(r.status).toBe(400);
  });
});
