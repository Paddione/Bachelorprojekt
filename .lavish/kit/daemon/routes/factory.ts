// routes/factory.ts — STUB handler for /api/admin/factory-control
// Real data in p2 (factory-mcp)
import type { Context } from 'hono';
import { getCached, setCache } from '../lib/cache';

export async function factoryStatusHandler(c: Context) {
  try {
    // STUB: In p2 durch factory-mcp ersetzen
    const data = {
      queue_depth: 3,
      running: 'T002460',
      waiting: ['T002461', 'T002424'],
      last_tick: new Date().toISOString(),
    };
    const entry = setCache('factory-status', data, 60_000);
    return c.json({ ...data, fetchedAt: entry.fetchedAt });
  } catch (e: any) {
    return c.json({ error: e.message, fetchedAt: new Date().toISOString() });
  }
}
