// routes/custom.ts — Real data sources (p2)
import type { Context } from 'hono';
import { setCache } from '../lib/cache';
import { getAgentSessions } from '../sources/agent-lock';
import { getSessions } from '../sources/opencode-db';
import { getCIRuns } from '../sources/gh-axi';
import { checkModels } from '../sources/model-health';

export async function agentsHandler(c: Context) {
  try {
    const [agents, sessions] = await Promise.all([
      getAgentSessions(),
      getSessions().catch(() => []),
    ]);
    const merged = agents.map(a => {
      const s = sessions.find(s => s.ticket_id === a.ticket);
      return { ...a, worktree: s?.worktree || a.worktree, last_active: s?.status };
    });
    const entry = setCache('agents', merged, 15_000);
    return c.json({ agents: merged, fetchedAt: entry.fetchedAt });
  } catch (e: any) {
    return c.json({ error: e.message, fetchedAt: new Date().toISOString() });
  }
}

export async function ciHandler(c: Context) {
  try {
    const runs = await getCIRuns();
    const entry = setCache('ci', runs, 120_000);
    return c.json({ runs, fetchedAt: entry.fetchedAt });
  } catch (e: any) {
    return c.json({ error: e.message, fetchedAt: new Date().toISOString() });
  }
}

export async function modelsHandler(c: Context) {
  try {
    const models = await checkModels();
    const entry = setCache('models', models, 30_000);
    return c.json({ models, fetchedAt: entry.fetchedAt });
  } catch (e: any) {
    return c.json({ error: e.message, fetchedAt: new Date().toISOString() });
  }
}
