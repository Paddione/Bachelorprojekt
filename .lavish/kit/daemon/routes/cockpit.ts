// routes/cockpit.ts — Real data sources (p2)
import type { Context } from 'hono';
import { setCache } from '../lib/cache';
import { getTickets, getTicketDetail } from '../sources/ticket-mcp';

export async function portfolioHandler(c: Context) {
  try {
    const data = await getTickets();
    const entry = setCache('portfolio', data, 300_000);
    return c.json({ data, fetchedAt: entry.fetchedAt });
  } catch (e: any) {
    const entry = setCache('portfolio', null as any, 300_000, e.message);
    return c.json({ error: e.message, fetchedAt: entry.fetchedAt, staleSince: entry.staleSince });
  }
}

export async function featureHandler(c: Context) {
  const extId = c.req.query('extId') || '';
  const brand = c.req.query('brand') || 'mentolder';
  try {
    const ticket = await getTicketDetail(extId);
    if (!ticket) return c.json({ error: `Ticket ${extId} not found` }, 404);
    return c.json({ ...ticket, brand, fetchedAt: new Date().toISOString() });
  } catch (e: any) {
    return c.json({ error: e.message, fetchedAt: new Date().toISOString() });
  }
}
