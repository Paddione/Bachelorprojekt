// Ordered pipeline-lane SSOT. The ONE front→back declaration; PIPELINE_STATUSES
// and STATUS_BUCKETS are derived from it. Pure module — imports only ./status
// (no DB, no API), so tests and Svelte components can import it without booting
// the pg Pool.
// The 11 canonical status values are NOT declared here — they come from
// ./status.ts (T007955 SSOT). ALL_TICKET_STATUSES is the historical name, kept
// as an alias so existing consumers and the factory-floor.ts re-export contract
// stay untouched; lane order lives in PIPELINE_LANES below.
import { TICKET_STATUSES, type TicketStatus } from './status';

export const ALL_TICKET_STATUSES = TICKET_STATUSES;
export type { TicketStatus } from './status';

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
