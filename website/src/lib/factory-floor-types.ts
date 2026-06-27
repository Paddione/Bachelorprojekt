// website/src/lib/factory-floor-types.ts
// Type-only (and pure-constant) re-exports from factory-floor.ts. The runtime
// module pulls in `pg` + `dns` via website-db (server-only Node built-ins);
// Svelte/Astro files that only need the *types* and the client-safe `PHASE_ORDER`
// constant must import them from here to keep the Vite client-side resolver
// from walking factory-floor.ts and emitting "externalized for browser"
// warnings — and worse, from accidentally bundling server code (including the
// SESSIONS_DATABASE_URL connection string) into the client bundle when a
// refactor swaps `import type` for a runtime import.
//
// Runtime functions (getFloor, getTicketDetail, getControl, …) stay in
// factory-floor.ts — this file intentionally has zero server-side imports.

// Re-exported from factory-floor-lanes (pure module, no DB).
export type { ShippedItem, AwaitingDeployItem } from './factory-floor-lanes';

export const PHASE_ORDER = ['scout', 'design', 'plan', 'implement', 'verify', 'deploy'] as const;
export type Phase = (typeof PHASE_ORDER)[number];
export type PhaseState = 'entered' | 'done' | 'blocked';

export type PhaseSegmentState = 'pending' | 'active' | 'done' | 'blocked';
export interface PhaseProgressSegment { phase: Phase; state: PhaseSegmentState; }

export function phaseProgress(phase: Phase | null, state: PhaseState | null): PhaseProgressSegment[] {
  const idx = phase ? PHASE_ORDER.indexOf(phase) : -1;
  return PHASE_ORDER.map((p, i): PhaseProgressSegment => {
    if (idx < 0 || i < idx) return { phase: p, state: idx < 0 ? 'pending' : 'done' };
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
