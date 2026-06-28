import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { pool } from '../../../lib/website-db';
import { toDeliveryMetric, summarize } from '../../../lib/delivery-metrics';
import type { DeliveryRow, GhWorkflowRun, DeliveryMetric } from '../../../lib/delivery-metrics';


export const prerender = false;

const GH_REPO = process.env.GITHUB_REPO ?? 'Paddione/Bachelorprojekt';
const GH_PAT = process.env.GITHUB_PAT ?? '';
const GH_API = 'https://api.github.com';
const CACHE_TTL_MS = 300_000;
const ghCache = new Map<string, { at: number; data: Map<number, string> }>();

function ghHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (GH_PAT) h.Authorization = `Bearer ${GH_PAT}`;
  return h;
}

async function fetchDeployTimestamps(prNumbers: number[], mergedAts: (string | null)[]): Promise<Map<number, string>> {
  if (!GH_PAT || prNumbers.length === 0) return new Map();

  const cacheKey = `${prNumbers.length}_${mergedAts[0] ?? ''}`;
  const hit = ghCache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  const deployMap = new Map<number, string>();
  try {
    const url = `${GH_API}/repos/${GH_REPO}/actions/runs?event=push&branch=main&per_page=50`;
    const res = await fetch(url, { headers: ghHeaders() });
    if (!res.ok) return deployMap;
    const body = (await res.json()) as { workflow_runs?: GhWorkflowRun[] };
    const runs = (body.workflow_runs ?? []).filter(
      (r) => r.conclusion === 'success' && r.name.toLowerCase().includes('build-website'),
    );

    for (let i = 0; i < prNumbers.length; i++) {
      const mergedAt = mergedAts[i];
      if (!mergedAt) continue;
      const mergedMs = new Date(mergedAt).getTime();
      const match = runs.find((r) => new Date(r.run_started_at).getTime() >= mergedMs);
      if (match) deployMap.set(prNumbers[i], match.run_started_at);
    }
  } catch {
    // fail-open: return empty map
  }

  ghCache.set(cacheKey, { at: Date.now(), data: deployMap });
  return deployMap;
}

export const GET: APIRoute = async ({ request , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const windowParam = url.searchParams.get('window') ?? '7d';
  let interval: string;
  let windowDays: number;
  switch (windowParam) {
    case '30d': interval = "INTERVAL '30 days'"; windowDays = 30; break;
    case 'all': interval = "INTERVAL '9999 days'"; windowDays = 0; break;
    default: interval = "INTERVAL '7 days'"; windowDays = 7; break;
  }

  try {
    const [deliveriesRes, bugsRes, providersRes] = await Promise.all([
      pool.query(
        `SELECT t.external_id AS ticket_id, t.title,
                t.created_at AS ticket_created_at, t.done_at,
                l.pr_number, pe.created_at AS pr_opened_at, pe.merged_at
           FROM tickets.tickets t
           JOIN tickets.ticket_links l ON l.from_id = t.id AND l.kind = 'pr' AND l.pr_number IS NOT NULL
           JOIN tickets.pr_events pe ON pe.pr_number = l.pr_number
          WHERE t.type = 'feature' AND t.status = 'done'
            AND t.done_at >= now() - ${interval}
          ORDER BY t.done_at DESC LIMIT 200`,
      ),
      pool.query(
        `SELECT COUNT(*)::int AS bug_count
           FROM tickets.tickets
          WHERE type = 'bug' AND status = 'done'
            AND done_at >= now() - ${interval}`,
      ),
      pool.query(
        `SELECT provider, COUNT(*)::int AS cnt
           FROM tickets.provider_config
          WHERE enabled = true AND (is_active IS NOT FALSE)
          GROUP BY provider`,
      ),
    ]);

    const rows = deliveriesRes.rows as DeliveryRow[];
    const bugCount = (bugsRes.rows[0]?.bug_count ?? 0) as number;
    const providerCounts: Record<string, number> = {};
    for (const r of providersRes.rows as Array<{ provider: string; cnt: number }>) {
      providerCounts[r.provider] = r.cnt;
    }

    const prNumbers = rows.map((r) => r.pr_number);
    const mergedAts = rows.map((r) => r.merged_at);
    const deployMap = await fetchDeployTimestamps(prNumbers, mergedAts);

    const metrics: DeliveryMetric[] = rows.map((row) =>
      toDeliveryMetric(row, deployMap.get(row.pr_number) ?? null, GH_REPO),
    );

    const summary = summarize(metrics, bugCount, windowDays, providerCounts);

    return new Response(JSON.stringify({ metrics, summary, ghRepo: GH_REPO }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/admin/delivery-metrics] error:');
    return new Response(JSON.stringify({ error: 'fetch_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
