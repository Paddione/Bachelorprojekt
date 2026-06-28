import { logger } from './logger';

const GH_REPO = 'Paddione/Bachelorprojekt';

export interface CiCheck {
  name: string;
  status: string;
  conclusion: string | null;
  url: string | null;
}
export type CiRollup = 'success' | 'pending' | 'failure' | null;

export function normalizeChecks(runs: any[]): CiCheck[] {
  return (runs ?? []).map(r => ({
    name: r.name, status: r.status, conclusion: r.conclusion ?? null,
    url: r.details_url ?? r.html_url ?? null,
  }));
}

export function rollupConclusion(checks: CiCheck[]): CiRollup {
  if (!checks.length) return null;
  if (checks.some(c => c.status !== 'completed')) return 'pending';
  if (checks.some(c => c.conclusion && !['success', 'neutral', 'skipped'].includes(c.conclusion))) return 'failure';
  return 'success';
}

const TTL_MS = 30_000;
const cache = new Map<number, { at: number; checks: CiCheck[]; rollup: CiRollup }>();

function token(): string | null {
  return process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? null;
}

export async function fetchCiChecks(prNumber: number): Promise<{ checks: CiCheck[]; rollup: CiRollup }> {
  const hit = cache.get(prNumber);
  if (hit && Date.now() - hit.at < TTL_MS) return { checks: hit.checks, rollup: hit.rollup };
  const tok = token();
  if (!tok) return { checks: [], rollup: null };
  const hdr = { authorization: `Bearer ${tok}`, accept: 'application/vnd.github+json' };
  try {
    const prRes = await fetch(`https://api.github.com/repos/${GH_REPO}/pulls/${prNumber}`, { headers: hdr });
    if (!prRes.ok) return { checks: [], rollup: null };
    const sha = (await prRes.json())?.head?.sha;
    if (!sha) return { checks: [], rollup: null };
    const cr = await fetch(`https://api.github.com/repos/${GH_REPO}/commits/${sha}/check-runs`, { headers: hdr });
    if (!cr.ok) return { checks: [], rollup: null };
    const checks = normalizeChecks((await cr.json())?.check_runs ?? []);
    const rollup = rollupConclusion(checks);
    cache.set(prNumber, { at: Date.now(), checks, rollup });
    return { checks, rollup };
  } catch (err) {
    logger.error({ err }, '[factory-ci] fetch failed');
    return { checks: [], rollup: null };
  }
}
