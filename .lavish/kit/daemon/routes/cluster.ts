// routes/cluster.ts — Real data sources (p2)
import type { Context } from 'hono';
import { setCache } from '../lib/cache';
import { getPods, getWarnings } from '../sources/kubectl';

export async function podsListHandler(c: Context) {
  const ns = c.req.query('namespace') || undefined;
  try {
    const data = await getPods(ns);
    const entry = setCache(`pods-${ns||'all'}`, data, 30_000);
    return c.json({ ...data, fetchedAt: entry.fetchedAt });
  } catch (e: any) {
    const entry = setCache(`pods-${ns||'all'}`, null as any, 30_000, e.message);
    return c.json({ error: e.message, fetchedAt: entry.fetchedAt, staleSince: entry.staleSince });
  }
}

export async function warningsHandler(c: Context) {
  try {
    const warnings = await getWarnings();
    const entry = setCache('warnings', warnings, 30_000);
    return c.json({ warnings, fetchedAt: entry.fetchedAt });
  } catch (e: any) {
    return c.json({ error: e.message, fetchedAt: new Date().toISOString() });
  }
}
