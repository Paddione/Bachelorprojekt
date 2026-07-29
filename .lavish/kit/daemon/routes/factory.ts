// routes/factory.ts — Real data sources (p2)
import type { Context } from 'hono';
import { setCache } from '../lib/cache';
import { getFactoryStatus } from '../sources/factory-mcp';

export async function factoryStatusHandler(c: Context) {
  try {
    const data = await getFactoryStatus();
    const entry = setCache('factory-status', data, 60_000);
    return c.json({ ...data, fetchedAt: entry.fetchedAt });
  } catch (e: any) {
    return c.json({ error: e.message, fetchedAt: new Date().toISOString() });
  }
}
