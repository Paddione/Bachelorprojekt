// routes/cockpit.ts — STUB handlers for /api/admin/cockpit/*
// Real data sources will be wired in p2
import type { Context } from 'hono';
import { getCached, setCache } from '../lib/cache';

async function fetchPortfolio() {
  // STUB: Return K1-level fixtures so the adapter contract tests pass
  return [
    { id: 'T002460', title: 'K1: Lavish Design-Kit', status: 'in_progress', priority: 'hoch', epic: 'T002458' },
    { id: 'T002461', title: 'K2: Daten-Adapter & lokaler Daemon', status: 'planning', priority: 'hoch', epic: 'T002458' },
  ];
}

export async function portfolioHandler(c: Context) {
  try {
    const data = await fetchPortfolio();
    const entry = setCache('portfolio', data, 300_000); // 5 min TTL
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
    // STUB: In p2 durch ticket-mcp get_ticket ersetzen
    return c.json({
      id: extId,
      title: `Ticket ${extId}`,
      status: 'triage',
      brand,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return c.json({ error: e.message, fetchedAt: new Date().toISOString() });
  }
}
