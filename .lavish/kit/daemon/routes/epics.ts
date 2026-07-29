// routes/epics.ts — GET /api/cockpit/epics (K5)
import type { Context } from 'hono';
import { exec } from '../lib/exec';
import { setCache, getCached, isFresh } from '../lib/cache';

export interface EpicSummary {
  id: string;
  title: string;
  status: string;
  priority: string;
  childCount: number;
}

async function fetchEpics(): Promise<EpicSummary[]> {
  const result = await exec(
    'bash scripts/vda/ticket.sh list --type project,feat --status planning,plan_staged,in_progress --json 2>/dev/null || echo "[]"',
    10000
  );

  if (!result.ok || !result.stdout) {
    return [];
  }

  try {
    const tickets = JSON.parse(result.stdout);
    const epics = Array.isArray(tickets) ? tickets : (tickets.tickets || []);
    return epics.map((t: any) => ({
      id: t.external_id || t.id || '',
      title: t.title || '',
      status: t.status || 'unknown',
      priority: t.priority || 'mittel',
      childCount: 0,
    }));
  } catch {
    return [];
  }
}

export async function epicsHandler(c: Context) {
  try {
    const cached = getCached<EpicSummary[]>('epics');
    if (cached && isFresh(cached)) {
      return c.json({ epics: cached.data, fetchedAt: cached.fetchedAt });
    }

    const epics = await fetchEpics();
    const entry = setCache('epics', epics, 60_000);
    return c.json({ epics, fetchedAt: entry.fetchedAt });
  } catch (e: any) {
    return c.json({ error: e.message, fetchedAt: new Date().toISOString() });
  }
}

export async function epicsChangesSinceHandler(c: Context) {
  const ts = c.req.query('ts');
  if (!ts) return c.json({ hasChanges: false });

  try {
    const result = await exec(
      `git log --oneline --since="${ts}" -- openspec/changes/ 2>/dev/null | wc -l`,
      5000
    );
    const count = parseInt(result.stdout, 10);
    return c.json({ hasChanges: count > 0 });
  } catch {
    return c.json({ hasChanges: true });
  }
}
