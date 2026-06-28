import type { ShippedItem, AwaitingDeployItem } from './factory-floor-lanes';

export const PHASE_ORDER = ['scout', 'design', 'plan', 'implement', 'verify', 'deploy'] as const;
export type Phase = (typeof PHASE_ORDER)[number];
export type PhaseState = 'entered' | 'done' | 'blocked';

export type PhaseSegmentState = 'pending' | 'active' | 'done' | 'blocked';
export interface PhaseProgressSegment { phase: Phase; state: PhaseSegmentState; }

export function phaseProgress(phase: Phase | null, state: PhaseState | null): PhaseProgressSegment[] {
  const idx = phase ? PHASE_ORDER.indexOf(phase) : -1;
  return PHASE_ORDER.map((p, i): PhaseProgressSegment => {
    if (idx < 0 || i < idx) return { phase: p, state: idx < 0 ? 'pending' : 'done' };
    if (i > idx) return { phase: p, state: 'pending' };
    if (state === 'blocked') return { phase: p, state: 'blocked' };
    if (state === 'done') return { phase: p, state: 'done' };
    return { phase: p, state: 'active' };
  });
}

export interface AttentionPayload {
  blocked: { extId: string; reason: string }[];
  stuck:   { extId: string; minutes: number }[];
  cooldowns: { provider: string; cooldownUntil: string | null }[];
  isEmpty: boolean;
}

export function buildAttention(
  hall: HallItem[], providers: ProviderStatus[], stuckMin = 15,
): AttentionPayload {
  const blocked = hall
    .filter(h => h.phaseState === 'blocked')
    .map(h => ({ extId: h.extId, reason: h.blockReason ?? 'blockiert' }));
  const stuck = hall
    .filter(h => h.phaseState !== 'blocked' && h.phaseSince &&
      (Date.now() - new Date(h.phaseSince).getTime()) / 60_000 >= stuckMin)
    .map(h => ({ extId: h.extId, minutes: Math.round((Date.now() - new Date(h.phaseSince!).getTime()) / 60_000) }));
  const cooldowns = providers
    .filter(p => p.status === 'cooldown')
    .map(p => ({ provider: p.provider, cooldownUntil: p.cooldownUntil }));
  return { blocked, stuck, cooldowns, isEmpty: !blocked.length && !stuck.length && !cooldowns.length };
}

export interface TimelineEntry extends PhaseEventRow { durationSec: number | null; }
export function phaseDurations(events: PhaseEventRow[]): TimelineEntry[] {
  const asc = [...events].sort((a, b) => +new Date(a.at) - +new Date(b.at));
  return asc.map((e, i) => ({
    ...e,
    durationSec: i === 0 ? null : Math.round((+new Date(e.at) - +new Date(asc[i - 1].at)) / 1000),
  }));
}

export interface ControlSnapshot {
  killSwitch: boolean;
  slotsUsed: number;
  slotsCap: number;
  dailyCap: number;
  dailyUsed: number;
  dryRun: boolean;
  watchdogStale: number;
}
export interface FloorMetrics { shippedToday: number; avgCycleH: number | null; }
export interface PlanningCount {
  total: number;
  ready: number;
}
export interface LoadingDockItem { extId: string; title: string; priority: string; waitReason: string; }
export interface HallItem {
  extId: string; title: string; priority: string;
  phase: Phase | null; phaseState: PhaseState | null; phaseSince: string | null;
  retryCount: number; blockReason: string | null; slot: number | null;
  driver: 'factory' | 'devflow' | null;
  prNumber: number | null;
  ciStatus: 'success' | 'pending' | 'failure' | null;
  phaseProgress: PhaseProgressSegment[];
}
export interface StagedItem {
  extId: string; title: string; priority: string;
  branch: string | null; planPath: string | null; createdAt: string | null;
}
export interface ProviderStatus {
  provider: string;
  status: 'healthy' | 'cooldown';
  activeAgents: number;
  maxConcurrent: number;
  cooldownUntil: string | null;
  tiers: string[];
}
export interface FloorPayload {
  control: ControlSnapshot;
  metrics: FloorMetrics;
  loadingDock: LoadingDockItem[];
  hall: HallItem[];
  shipped: ShippedItem[];
  awaitingDeploy: AwaitingDeployItem[];
  awaitingDeployVisible: boolean;
  staged: StagedItem[];
  providerHealth: ProviderStatus[];
  officeWaiting: number;
  stagedWaiting: number;
  planningCount: PlanningCount;
  attention: AttentionPayload;
  fetchedAt: string;
}

export interface PhaseEventRow { phase: Phase; state: PhaseState; detail: string | null; driver: string; at: string; }
export interface Breadcrumb { authorLabel: string; body: string; at: string; }
export type InjectionKind = 'context' | 'note' | 'asset';
export interface InjectionRow {
  id: string; phase: Phase | null; kind: InjectionKind;
  title: string | null; content: string | null; targetFiles: string[] | null;
  dataUrl: string | null; ncPath: string | null; filename: string | null; mimeType: string | null;
  injectedBy: string; injectedAt: string; consumedAt: string | null;
}
export interface InjectInput {
  extId: string; kind: InjectionKind; phase?: Phase | null;
  title?: string | null; content?: string | null; targetFiles?: string[] | null;
  dataUrl?: string | null; ncPath?: string | null; filename?: string | null; mimeType?: string | null;
  injectedBy: string;
}
export interface SuggestedFile {
  path: string;
  score: number;
  snippet: string;
}
export interface TicketDetail {
  extId: string; title: string; status: string; priority: string;
  retryCount: number; prNumber: number | null;
  events: PhaseEventRow[];
  breadcrumbs: Breadcrumb[];
  injections: InjectionRow[];
  suggested_files?: SuggestedFile[];
}

/** Extract a PR number from a phase-event detail string ("PR #1512 · …"); null on miss. */
export function parsePrNumber(detail: string | null): number | null {
  if (!detail) return null;
  const m = /PR #(\d+)/.exec(detail);
  return m ? parseInt(m[1], 10) : null;
}

/** Parse "FACTORY-PLAN-REF branch=<b> plan=<p>" -> { branch, planPath }; nulls on miss. */
export function parsePlanRef(body: string | null): { branch: string | null; planPath: string | null } {
  if (!body) return { branch: null, planPath: null };
  const branch = /\bbranch=(\S+)/.exec(body)?.[1] ?? null;
  const planPath = /\bplan=(\S+)/.exec(body)?.[1] ?? null;
  return { branch, planPath };
}

export function mapInjection(r: Record<string, unknown>): InjectionRow {
  return {
    id: String(r.id), phase: (r.phase as Phase | null) ?? null, kind: r.kind as InjectionKind,
    title: (r.title as string | null) ?? null, content: (r.content as string | null) ?? null,
    targetFiles: (r.target_files as string[] | null) ?? null,
    dataUrl: (r.data_url as string | null) ?? null, ncPath: (r.nc_path as string | null) ?? null,
    filename: (r.filename as string | null) ?? null, mimeType: (r.mime_type as string | null) ?? null,
    injectedBy: r.injected_by as string, injectedAt: new Date(r.injected_at as string).toISOString(),
    consumedAt: r.consumed_at ? new Date(r.consumed_at as string).toISOString() : null,
  };
}
