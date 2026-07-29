// routes/custom.ts — STUB handlers for /api/cockpit/{agents,ci,models}
// Real data in p2 (agent-lock, gh-axi, model-health)
import type { Context } from 'hono';
import { getCached, setCache } from '../lib/cache';

export async function agentsHandler(c: Context) {
  try {
    // STUB: In p2 durch agent-lock.sh list ersetzen
    const agents = [
      { sid: 'stub-session', label: 'p2-implementation-needed', ticket: '', status: 'stub' },
    ];
    const entry = setCache('agents', agents, 15_000);
    return c.json({ agents, fetchedAt: entry.fetchedAt });
  } catch (e: any) {
    return c.json({ error: e.message, fetchedAt: new Date().toISOString() });
  }
}

export async function ciHandler(c: Context) {
  try {
    // STUB: In p2 durch gh-axi run list ersetzen
    const runs: any[] = [];
    const entry = setCache('ci', runs, 120_000);
    return c.json({ runs, fetchedAt: entry.fetchedAt });
  } catch (e: any) {
    return c.json({ error: e.message, fetchedAt: new Date().toISOString() });
  }
}

export async function modelsHandler(c: Context) {
  try {
    // STUB: In p2 durch model-health.ts ersetzen
    const models = [
      { name: 'gemma-4-12b', port: 8091, status: 'unknown' },
    ];
    const entry = setCache('models', models, 30_000);
    return c.json({ models, fetchedAt: entry.fetchedAt });
  } catch (e: any) {
    return c.json({ error: e.message, fetchedAt: new Date().toISOString() });
  }
}
