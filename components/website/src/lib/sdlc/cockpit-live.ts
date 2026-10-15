// Cockpit Live-Lage (no-DB) — pure aggregation over gh+git+Plan-Frontmatter.
// No network, no DB, no filesystem: collectors live in cockpit-live-source.ts,
// this module only turns collected rows into the five views. Fully unit-tested.
import { rollupConclusion, type CiCheck, type CiRollup } from './cockpit-ci';

// Repo-Norm: >14d Inaktivität gilt als veraltet (vgl. G-WT02 in
// scripts/health-goals-check.sh: "HEAD gemergt oder >14d inaktiv").
export const STALE_DAYS_DEFAULT = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface LiveBranch {
  name: string;
  lastCommitAt: string | null;
  hasUpstream: boolean;
  isDefault: boolean;
}

export interface LivePlan {
  ref: string;
  title: string;
  status: string;
}

export interface LivePr {
  number: number;
  title: string;
  branch: string;
  draft: boolean;
  mergeable: string;
  mergeStateStatus: string;
  updatedAt: string | null;
  checks: CiCheck[];
}

export interface OpenWorkRow {
  kind: 'branch' | 'plan';
  label: string;
  detail: string;
  action: string;
}

export interface PrReadyRow {
  number: number;
  title: string;
  branch: string;
  state: 'bereit' | 'entwurf' | 'blockiert' | 'offen';
  detail: string;
  action: string;
}

export interface CiRedRow {
  number: number;
  title: string;
  failing: string[];
  action: string;
}

export interface StaleRow {
  branch: string;
  lastCommitAt: string | null;
  ageDays: number | null;
  action: string;
}

export interface NextAction {
  scope: 'pr' | 'branch' | 'plan';
  label: string;
  action: string;
}

export interface LiveFloor {
  generatedAt: string;
  degraded: string[];
  openWork: OpenWorkRow[];
  prReady: PrReadyRow[];
  ciRed: CiRedRow[];
  stale: StaleRow[];
  nextActions: NextAction[];
}

export interface LiveFloorInput {
  branches: LiveBranch[];
  plans: LivePlan[];
  prs: LivePr[];
  staleDays?: number;
}

/** Failing check names: completed runs whose conclusion is not clean. */
export function failingCheckNames(checks: CiCheck[]): string[] {
  return (checks ?? [])
    .filter((c) => c.status === 'completed' && c.conclusion && !['success', 'neutral', 'skipped'].includes(c.conclusion))
    .map((c) => c.name);
}

export function ciRollup(checks: CiCheck[]): CiRollup {
  return rollupConclusion(checks ?? []);
}

/** True when the last commit is strictly older than the threshold. */
export function isStale(lastCommitAt: string | null, nowMs: number, thresholdDays: number): boolean {
  if (!lastCommitAt) return true;
  const at = new Date(lastCommitAt).getTime();
  if (Number.isNaN(at)) return true;
  return nowMs - at > thresholdDays * DAY_MS;
}

export function ageDays(lastCommitAt: string | null, nowMs: number): number | null {
  if (!lastCommitAt) return null;
  const at = new Date(lastCommitAt).getTime();
  if (Number.isNaN(at)) return null;
  return Math.floor((nowMs - at) / DAY_MS);
}

/** Exactly one derived action per PR — no free text, no second guess. */
export function prAction(pr: LivePr): string {
  const rollup = ciRollup(pr.checks);
  if (rollup === 'failure') {
    const names = failingCheckNames(pr.checks);
    return names.length ? `Fehlende Checks fixen: ${names.join(', ')}` : 'Fehlende Checks fixen';
  }
  if (pr.draft) return 'Entwurf auflösen und Review anfordern';
  if (pr.mergeable === 'CONFLICTING') return 'Merge-Konflikte auflösen';
  if (rollup === 'pending') return 'Checks abwarten';
  if (pr.mergeable === 'MERGEABLE' && (pr.mergeStateStatus === 'CLEAN' || pr.mergeStateStatus === '')) {
    return 'Squash-mergen';
  }
  return 'PR-Status prüfen';
}

export function prState(pr: LivePr): PrReadyRow['state'] {
  if (pr.draft) return 'entwurf';
  if (ciRollup(pr.checks) === 'failure' || pr.mergeable === 'CONFLICTING') return 'blockiert';
  if (pr.mergeable === 'MERGEABLE' && ciRollup(pr.checks) === 'success') return 'bereit';
  return 'offen';
}

export function buildLiveFloor(input: LiveFloorInput, nowMs: number = Date.now()): LiveFloor {
  const branches = input.branches ?? [];
  const plans = input.plans ?? [];
  const prs = input.prs ?? [];
  const staleDays = input.staleDays ?? STALE_DAYS_DEFAULT;
  const prBranches = new Set(prs.map((p) => p.branch));

  const openWork: OpenWorkRow[] = [];
  for (const b of branches) {
    if (b.isDefault || prBranches.has(b.name)) continue;
    const stale = isStale(b.lastCommitAt, nowMs, staleDays);
    openWork.push({
      kind: 'branch',
      label: b.name,
      detail: stale ? 'ohne offenen PR, zuletzt geändert vor längerer Zeit' : 'ohne offenen PR',
      action: stale ? 'Rebasen oder löschen' : 'PR erstellen',
    });
  }
  for (const p of plans) {
    if (p.status !== 'active') continue;
    openWork.push({ kind: 'plan', label: p.ref, detail: p.title, action: 'Umsetzung starten' });
  }

  const prReady: PrReadyRow[] = prs.map((pr) => ({
    number: pr.number,
    title: pr.title,
    branch: pr.branch,
    state: prState(pr),
    detail: pr.draft ? 'Entwurf' : `Mergeable: ${pr.mergeable || 'unbekannt'}`,
    action: prAction(pr),
  }));

  const ciRed: CiRedRow[] = prs
    .filter((pr) => ciRollup(pr.checks) === 'failure')
    .map((pr) => ({ number: pr.number, title: pr.title, failing: failingCheckNames(pr.checks), action: prAction(pr) }));

  const stale: StaleRow[] = branches
    .filter((b) => !b.isDefault && isStale(b.lastCommitAt, nowMs, staleDays))
    .map((b) => ({
      branch: b.name,
      lastCommitAt: b.lastCommitAt,
      ageDays: ageDays(b.lastCommitAt, nowMs),
      action: prBranches.has(b.name) ? 'PR zum Abschluss bringen' : 'Rebasen oder löschen',
    }));

  // View 5: one prioritized next action per underlying row — CI-Rot zuerst.
  const nextActions: NextAction[] = [
    ...ciRed.map((r) => ({ scope: 'pr' as const, label: `#${r.number} ${r.title}`, action: r.action })),
    ...prReady
      .filter((r) => r.state === 'bereit')
      .map((r) => ({ scope: 'pr' as const, label: `#${r.number} ${r.title}`, action: r.action })),
    ...prReady
      .filter((r) => r.state === 'entwurf' || r.state === 'offen')
      .map((r) => ({ scope: 'pr' as const, label: `#${r.number} ${r.title}`, action: r.action })),
    ...openWork.map((r) => ({
      scope: (r.kind === 'plan' ? 'plan' : 'branch') as 'plan' | 'branch',
      label: r.label,
      action: r.action,
    })),
  ].slice(0, 10);

  return { generatedAt: new Date(nowMs).toISOString(), degraded: [], openWork, prReady, ciRed, stale, nextActions };
}
