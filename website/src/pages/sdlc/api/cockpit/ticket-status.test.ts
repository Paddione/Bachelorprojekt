import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../lib/auth', () => ({
  getSession: vi.fn(async (cookie: string | null) =>
    cookie === 'admin' ? { preferred_username: 'admin', email: 'admin@x', realmRoles: ['admin'] } : cookie === 'plain' ? { preferred_username: 'plain', email: 'p@x', realmRoles: [] } : null,
  ),
  isAdmin: vi.fn((s: { realmRoles?: string[] } | null | undefined) => s?.realmRoles?.includes('admin') ?? false),
}));
const setTicketStatus = vi.fn(async (_brand: unknown, _ticketId: unknown, _status: unknown, _actor: unknown) => ({ ok: true, from: 'backlog', to: 'in_progress' }));
vi.mock('../../../../lib/sdlc/tickets/cockpit-db', () => ({
  setTicketStatus: (brand: unknown, ticketId: unknown, status: unknown, actor: unknown) =>
    setTicketStatus(brand, ticketId, status, actor),
}));

import { POST } from './ticket-status';

beforeEach(() => {
  setTicketStatus.mockClear();
});

function req(cookie: string | null, body: unknown): Request {
  return new Request('http://x/sdlc/api/cockpit/ticket-status', {
    method: 'POST',
    headers: cookie ? { cookie, 'content-type': 'application/json' } : { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /sdlc/api/cockpit/ticket-status', () => {
  it('200 with a valid admin session and target status, returns from/to', async () => {
    const res = await POST({ request: req('admin', { ticketId: '42', status: 'in_progress' }) } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.from).toBe('backlog');
    expect(body.to).toBe('in_progress');
    expect(setTicketStatus).toHaveBeenCalledTimes(1);
  });

  it('403 without a session and does not call setTicketStatus', async () => {
    const res = await POST({ request: req(null, { ticketId: '42', status: 'in_progress' }) } as never);
    expect(res.status).toBe(403);
    expect(setTicketStatus).not.toHaveBeenCalled();
  });

  it('403 for a session without admin rights', async () => {
    const res = await POST({ request: req('plain', { ticketId: '42', status: 'in_progress' }) } as never);
    expect(res.status).toBe(403);
    expect(setTicketStatus).not.toHaveBeenCalled();
  });

  it('400 for an unknown target status', async () => {
    const res = await POST({ request: req('admin', { ticketId: '42', status: 'gibberish' }) } as never);
    expect(res.status).toBe(400);
    expect(setTicketStatus).not.toHaveBeenCalled();
  });
});
