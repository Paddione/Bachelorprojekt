import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as actions from './cockpit-table-actions';
import type { TicketRow } from './cockpit-types';

beforeEach(() => vi.restoreAllMocks());

describe('cockpit-table-actions', () => {
  it('transitionTicket POSTs to the transition endpoint and returns true on 200', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const ok = await actions.transitionTicket('t1', 'done');
    expect(ok).toBe(true);
    expect(spy).toHaveBeenCalledWith(
      '/api/admin/tickets/t1/transition',
      expect.objectContaining({ method: 'POST' }));
  });
  it('transitionTicket returns false on non-2xx', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('err', { status: 500 }));
    expect(await actions.transitionTicket('t1', 'done')).toBe(false);
  });
  it('transitionTicket includes resolution in the body when provided', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await actions.transitionTicket('t1', 'done', 'fixed');
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ status: 'done', resolution: 'fixed' });
  });
  it('transitionTicket omits resolution when not provided', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await actions.transitionTicket('t1', 'in_progress');
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ status: 'in_progress' });
  });
  it('patchPriority PATCHes the ticket', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await actions.patchPriority('t1', 'hoch');
    expect(spy).toHaveBeenCalledWith('/api/admin/tickets/t1',
      expect.objectContaining({ method: 'PATCH' }));
  });
  it('reorderTickets POSTs planningRank updates', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await actions.reorderTickets([{ id: 'a' }, { id: 'b' }] as unknown as TicketRow[]);
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(spy).toHaveBeenCalledWith('/api/admin/cockpit/reorder', expect.anything());
    expect(body.updates).toEqual([
      { ticketId: 'a', planningRank: 0 }, { ticketId: 'b', planningRank: 1 }]);
  });
  it('runBatch POSTs ticketIds + mutation', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await actions.runBatch(['t1', 't2'], { status: 'done' });
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(spy).toHaveBeenCalledWith('/api/admin/cockpit/batch', expect.anything());
    expect(body).toEqual({ ticketIds: ['t1', 't2'], mutation: { status: 'done' } });
  });
  it('createTicket POSTs the form payload and returns the parsed body', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'new1' }), { status: 200 }));
    const r = await actions.createTicket({ type: 'task', title: 'X', priority: 'mittel' });
    expect(r.ok).toBe(true);
    expect(r.body).toEqual({ id: 'new1' });
  });
  it('createTicket returns ok:false + error on failure', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'boom' }), { status: 400 }));
    const r = await actions.createTicket({ type: 'task', title: 'X', priority: 'mittel' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('boom');
  });
});
