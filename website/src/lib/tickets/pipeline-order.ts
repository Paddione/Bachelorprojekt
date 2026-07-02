// Ordered pipeline-lane SSOT. The ONE front→back declaration; PIPELINE_STATUSES
// and STATUS_BUCKETS are derived from it. Pure module — imports nothing (no DB,
// no API), so tests and Svelte components can import it without booting the pg Pool.
// Valid ticket states (Set, NOT lane order). Mirrors the DB CHECK in tickets-db.ts.
// Order is historical (blocked between in_review and qa_review) and intentionally
// preserved for backward compatibility — lane order lives in PIPELINE_LANES below.
export const ALL_TICKET_STATUSES = [
  'triage', 'planning', 'plan_staged', 'backlog', 'in_progress',
  'in_review', 'blocked', 'qa_review', 'awaiting_deploy', 'done', 'archived',
] as const;
export type TicketStatus = (typeof ALL_TICKET_STATUSES)[number];

export type LaneKey =
  | 'planning' | 'staged' | 'loadingDock' | 'hall' | 'qa' | 'awaitingDeploy' | 'shipped'
  | 'attention' | 'archive';

export interface PipelineLane {
  key: LaneKey;
  label: string;            // German display label
  statuses: TicketStatus[]; // member statuses, in order
  side: boolean;            // true = not part of the linear pipeline (blocked/archived)
}

// The EINZIGE ordered declaration (front→back). Everything else derives from this.
export const PIPELINE_LANES: readonly PipelineLane[] = [
  { key: 'planning',    label: 'Planung',        statuses: ['triage', 'planning'], side: false },
  { key: 'staged',      label: 'Kommissioniert', statuses: ['plan_staged'],        side: false },
  { key: 'loadingDock', label: 'Laderampe',      statuses: ['backlog'],            side: false },
  { key: 'hall',        label: 'In Arbeit',      statuses: ['in_progress', 'in_review'], side: false },
  { key: 'qa',             label: 'QS-Abnahme',     statuses: ['qa_review'],               side: false },
  { key: 'awaitingDeploy', label: 'Deploy-Wartung',  statuses: ['awaiting_deploy'],          side: false },
  { key: 'shipped',        label: 'Versand',         statuses: ['done'],                    side: false },
  { key: 'attention',   label: 'Blockiert',      statuses: ['blocked'],            side: true },
  { key: 'archive',     label: 'Archiv',         statuses: ['archived'],           side: true },
] as const;

// Derived: linear status rungs (side:false lanes only), in front→back order.
export const PIPELINE_STATUSES: readonly TicketStatus[] =
  PIPELINE_LANES.filter((l) => !l.side).flatMap((l) => l.statuses);

// Derived/centralized: status → lane-key. Replaces the hand-maintained map; values
// stay byte-identical to the previous literal (asserted in factory-floor.order.test.ts).
export const STATUS_BUCKETS: Record<TicketStatus, LaneKey> = Object.fromEntries(
  PIPELINE_LANES.flatMap((l) => l.statuses.map((s) => [s, l.key] as const)),
) as Record<TicketStatus, LaneKey>;
