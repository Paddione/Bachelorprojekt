// GitHub CI-status helper for the Factory Floor. Resolves a PR number to an
// aggregated check-run verdict (success | pending | failure), cached 60s
// in-memory to stay within unauthenticated/PAT rate limits. Fails CLOSED to
// null on any error — the Floor must never break because GitHub is slow/down.

const REPO = 'Paddione/Bachelorprojekt';
const API = 'https://api.github.com';
const CACHE_TTL_MS = 60_000;

export type CiStatus = 'success' | 'pending' | 'failure';
export interface CheckRun { status: string; conclusion: string | null; }

const FAILURE_CONCLUSIONS = new Set([
  'failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure', 'stale',
]);

/** Aggregate check-run results into one verdict. Pure — no network. */
export function aggregateCheckRuns(runs: CheckRun[]): CiStatus {
  if (runs.length === 0) return 'pending';
  if (runs.some((r) => r.status !== 'completed')) return 'pending';
  if (runs.some((r) => r.conclusion && FAILURE_CONCLUSIONS.has(r.conclusion))) return 'failure';
  if (runs.every((r) => r.conclusion === 'success' || r.conclusion === 'neutral' || r.conclusion === 'skipped')) {
    return 'success';
  }
  return 'pending';
}

interface CacheEntry { value: CiStatus | null; at: number; }
const cache = new Map<number, CacheEntry>();

function ghHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/vnd.github+json' };
  const pat = process.env.GITHUB_PAT;
  if (pat) h.Authorization = `Bearer ${pat}`;
  return h;
}

/** Resolve a PR number to its aggregated CI status (cached 60s). null on any error. */
export async function getPrCiStatus(prNumber: number): Promise<CiStatus | null> {
  const hit = cache.get(prNumber);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  let value: CiStatus | null = null;
  try {
    const commitsRes = await fetch(`${API}/repos/${REPO}/pulls/${prNumber}/commits?per_page=100`, { headers: ghHeaders() });
    if (commitsRes.ok) {
      const commits = await commitsRes.json() as Array<{ sha: string }>;
      const sha = commits[commits.length - 1]?.sha;
      if (sha) {
        const runsRes = await fetch(`${API}/repos/${REPO}/commits/${sha}/check-runs`, { headers: ghHeaders() });
        if (runsRes.ok) {
          const body = await runsRes.json() as { check_runs?: CheckRun[] };
          value = aggregateCheckRuns(body.check_runs ?? []);
        }
      }
    }
  } catch {
    value = null; // fail closed
  }
  cache.set(prNumber, { value, at: Date.now() });
  return value;
}
