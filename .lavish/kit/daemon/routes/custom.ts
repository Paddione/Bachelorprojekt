// routes/custom.ts — Real data sources (p2)
import type { Context } from 'hono';
import { cachedJson } from './_shared';
import { getAgentSessions } from '../sources/agent-lock';
import { getSessions } from '../sources/opencode-db';
import { getCIRuns } from '../sources/gh-axi';
import { checkModels } from '../sources/model-health';

export async function agentsHandler(c: Context) {
  return cachedJson(c, 'agents', 15_000, 'agents', async () => {
    const [agents, sessions] = await Promise.all([
      getAgentSessions(),
      getSessions().catch(() => []),
    ]);
    return agents.map(a => {
      const s = sessions.find(s => s.ticket_id === a.ticket);
      return { ...a, worktree: s?.worktree || a.worktree, last_active: s?.status };
    });
  });
}

export async function ciHandler(c: Context) {
  return cachedJson(c, 'ci', 120_000, 'runs', getCIRuns);
}

export async function modelsHandler(c: Context) {
  return cachedJson(c, 'models', 30_000, 'models', checkModels);
}
