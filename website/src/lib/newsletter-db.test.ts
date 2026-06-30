import { describe, it, expect, vi, beforeEach } from 'vitest';

const { Pool, resolve4, query, end } = vi.hoisted(() => {
  const queue: Array<{ rows: unknown[]; rowCount?: number }> = [];
  const query = vi.fn(async (..._args: [...unknown[]]) => {
    const next = queue.shift();
    if (next) return next;
    return { rows: [], rowCount: 0 };
  });
  const end = vi.fn(async (..._args: unknown[]) => undefined);
  class Pool {
    constructor(_opts: unknown) { /* ignore config */ }
    query(...a: unknown[]) { return query(...a); }
    end(...a: unknown[]) { return end(...a); }
  }
  const resolve4 = vi.fn();
  return { Pool, resolve4, query, end, queue };
});
vi.mock('pg', () => ({ default: { Pool }, Pool }));
vi.mock('dns', () => ({ default: { resolve4: (...a: unknown[]) => resolve4(...a) }, resolve4: (...a: unknown[]) => resolve4(...a) }));
vi.mock('./email', () => ({ sendNewsletterCampaign: vi.fn() }));

import { listSubscribers, getSubscriberByEmail, getSubscriberByConfirmToken, createSubscriber, updateSubscriberToken, confirmSubscriber, unsubscribeByToken, deleteSubscriber, listCampaigns, getCampaign, createCampaign, countSentCampaigns, sendCampaignById, listDueCampaignIds, lockDueCampaign, unlockCampaignToScheduled, resetStaleSendingCampaigns } from './newsletter-db';

beforeEach(() => { query.mockClear(); end.mockClear(); });
// Silence unused vars
void resolve4;

describe('newsletter-db (pg.Pool mocked, queue-based)', () => {
  it('listSubscribers with no filter: returns all rows', async () => {
    const out = await listSubscribers();
    expect(out).toEqual([]);
    const calls = query.mock.calls.map(c => c[0] as string);
    expect(calls.some(s => /FROM newsletter_subscribers/.test(s))).toBe(true);
    expect(calls.some(s => /ORDER BY created_at DESC/.test(s))).toBe(true);
  });

  it('listSubscribers with status filter: adds WHERE status = $1', async () => {
    await listSubscribers({ status: 'confirmed' });
    const calls = query.mock.calls.map(c => ({ sql: c[0] as string, params: c[1] as unknown[] }));
    const subscribersCall = calls.find(c => /FROM newsletter_subscribers/.test(c.sql));
    expect(subscribersCall).toBeDefined();
    expect(subscribersCall!.sql).toMatch(/WHERE status = \$1/);
    expect(subscribersCall!.params).toEqual(['confirmed']);
  });

  it('getSubscriberByEmail: SELECT includes confirm_token + unsubscribe_token', async () => {
    await getSubscriberByEmail('a@b.com');
    const calls = query.mock.calls.map(c => c[0] as string);
    const emailCall = calls.find(s => /FROM newsletter_subscribers WHERE email = \$1/.test(s));
    expect(emailCall).toBeDefined();
    expect(emailCall).toMatch(/confirm_token/);
    expect(emailCall).toMatch(/unsubscribe_token/);
  });

  it('getSubscriberByConfirmToken: SELECT filters on confirm_token', async () => {
    await getSubscriberByConfirmToken('ct-1');
    const calls = query.mock.calls.map(c => ({ sql: c[0] as string, params: c[1] as unknown[] }));
    const tokenCall = calls.find(c => /WHERE confirm_token = \$1/.test(c.sql));
    expect(tokenCall).toBeDefined();
    expect(tokenCall!.params).toEqual(['ct-1']);
  });

  it('createSubscriber: INSERT with the right columns', async () => {
    await createSubscriber({
      email: 'a@b.com', status: 'pending', source: 'website',
      unsubscribeToken: 'ut-1', confirmToken: 'ct-1', tokenExpiresAt: new Date('2026-12-01T00:00:00Z'),
    });
    const calls = query.mock.calls.map(c => ({ sql: c[0] as string, params: c[1] as unknown[] }));
    const insertCall = calls.find(c => /INSERT INTO newsletter_subscribers/.test(c.sql));
    expect(insertCall).toBeDefined();
    expect(insertCall!.params[0]).toBe('a@b.com');
    expect(insertCall!.params[1]).toBe('pending');
    expect(insertCall!.params[2]).toBe('website');
    expect(insertCall!.params[3]).toBe('ct-1');
  });

  it('createSubscriber: defaults confirmToken and tokenExpiresAt to null', async () => {
    await createSubscriber({ email: 'a@b.com', status: 'confirmed', source: 'admin', unsubscribeToken: 'ut-1' });
    const calls = query.mock.calls.map(c => ({ sql: c[0] as string, params: c[1] as unknown[] }));
    const insertCall = calls.find(c => /INSERT INTO newsletter_subscribers/.test(c.sql));
    expect(insertCall!.params[3]).toBeNull();
    expect(insertCall!.params[4]).toBeNull();
  });

  it('updateSubscriberToken: simple UPDATE', async () => {
    await updateSubscriberToken('s1', 'new-token', new Date('2026-12-31T00:00:00Z'));
    const calls = query.mock.calls.map(c => ({ sql: c[0] as string, params: c[1] as unknown[] }));
    const updateCall = calls.find(c => /UPDATE newsletter_subscribers/.test(c.sql));
    expect(updateCall).toBeDefined();
    expect(updateCall!.sql).toMatch(/SET confirm_token = \$1, token_expires_at = \$2/);
    expect(updateCall!.params).toEqual(['new-token', new Date('2026-12-31T00:00:00Z'), 's1']);
  });

  it('confirmSubscriber: UPDATE sets status=confirmed, clears tokens', async () => {
    await confirmSubscriber('s1');
    const calls = query.mock.calls.map(c => ({ sql: c[0] as string, params: c[1] as unknown[] }));
    const updateCall = calls.find(c => /SET status = 'confirmed'/.test(c.sql));
    expect(updateCall).toBeDefined();
    expect(updateCall!.sql).toMatch(/confirmed_at = now\(\)/);
    expect(updateCall!.sql).toMatch(/confirm_token = null/);
    expect(updateCall!.sql).toMatch(/token_expires_at = null/);
  });

  it('unsubscribeByToken: WHERE clause only updates confirmed subscribers', async () => {
    await unsubscribeByToken('ut-1');
    const calls = query.mock.calls.map(c => ({ sql: c[0] as string, params: c[1] as unknown[] }));
    const updateCall = calls.find(c => /SET status = 'unsubscribed'/.test(c.sql));
    expect(updateCall).toBeDefined();
    expect(updateCall!.sql).toMatch(/WHERE unsubscribe_token = \$1 AND status = 'confirmed'/);
  });

  it('deleteSubscriber: DELETE by id', async () => {
    await deleteSubscriber('s1');
    const calls = query.mock.calls.map(c => ({ sql: c[0] as string, params: c[1] as unknown[] }));
    const delCall = calls.find(c => /DELETE FROM newsletter_subscribers/.test(c.sql));
    expect(delCall).toBeDefined();
    expect(delCall!.params).toEqual(['s1']);
  });

  it('listCampaigns: returns all campaigns', async () => {
    await listCampaigns();
    const calls = query.mock.calls.map(c => c[0] as string);
    expect(calls.some(s => /FROM newsletter_campaigns/.test(s))).toBe(true);
    expect(calls.some(s => /ORDER BY created_at DESC/.test(s))).toBe(true);
  });

  it('getCampaign: SELECT WHERE id', async () => {
    await getCampaign('c1');
    const calls = query.mock.calls.map(c => ({ sql: c[0] as string, params: c[1] as unknown[] }));
    const call = calls.find(c => /FROM newsletter_campaigns WHERE id = \$1/.test(c.sql));
    expect(call).toBeDefined();
    expect(call!.params).toEqual(['c1']);
  });

  it('createCampaign: INSERT subject + html_body', async () => {
    await createCampaign({ subject: 'S', html_body: '<p>X</p>' });
    const calls = query.mock.calls.map(c => ({ sql: c[0] as string, params: c[1] as unknown[] }));
    const insertCall = calls.find(c => /INSERT INTO newsletter_campaigns/.test(c.sql));
    expect(insertCall).toBeDefined();
    expect(insertCall!.params).toEqual(['S', '<p>X</p>']);
  });

  it('countSentCampaigns: SELECT COUNT(*)', async () => {
    await countSentCampaigns();
    const calls = query.mock.calls.map(c => c[0] as string);
    expect(calls.some(s => /SELECT COUNT\(\*\)::int FROM newsletter_campaigns WHERE status = 'sent'/.test(s))).toBe(true);
  });

  it('sendCampaignById: returns error when the campaign does not exist', async () => {
    const out = await sendCampaignById('missing');
    expect(out).toEqual({ success: false, recipientCount: 0, error: 'Kampagne nicht gefunden' });
  });

  it('listDueCampaignIds: WHERE scheduled AND scheduled_publish_at <= now()', async () => {
    await listDueCampaignIds();
    const calls = query.mock.calls.map(c => c[0] as string);
    expect(calls.some(s => /WHERE status = 'scheduled' AND scheduled_publish_at <= now\(\)/.test(s))).toBe(true);
  });

  it('lockDueCampaign: WHERE scheduled AND scheduled_publish_at <= now()', async () => {
    await lockDueCampaign('c1');
    const calls = query.mock.calls.map(c => ({ sql: c[0] as string, params: c[1] as unknown[] }));
    const updateCall = calls.find(c => /UPDATE newsletter_campaigns/.test(c.sql));
    expect(updateCall).toBeDefined();
    expect(updateCall!.sql).toMatch(/SET status = 'sending'/);
    expect(updateCall!.sql).toMatch(/WHERE id = \$1 AND status = 'scheduled'/);
  });

  it('unlockCampaignToScheduled: WHERE id AND status = sending', async () => {
    await unlockCampaignToScheduled('c1');
    const calls = query.mock.calls.map(c => ({ sql: c[0] as string, params: c[1] as unknown[] }));
    const call = calls.find(c => /SET status = 'scheduled'/.test(c.sql));
    expect(call).toBeDefined();
    expect(call!.sql).toMatch(/WHERE id = \$1 AND status = 'sending'/);
  });

  it('resetStaleSendingCampaigns: WHERE sending AND updated_at < now - 10min', async () => {
    await resetStaleSendingCampaigns();
    const calls = query.mock.calls.map(c => c[0] as string);
    expect(calls.some(s => /status = 'sending' AND updated_at < now\(\) - INTERVAL '10 minutes'/.test(s))).toBe(true);
  });
});
