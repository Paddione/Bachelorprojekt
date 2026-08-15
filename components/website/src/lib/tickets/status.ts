// components/website/src/lib/tickets/status.ts
//
// Ticket status vocabulary SSOT (T007955). This is the SINGLE place that
// declares the 11 canonical ticket statuses; every other module imports from
// here instead of re-declaring the union. Previously the vocabulary was
// duplicated three times (lib/tickets/admin.ts, lib/tickets/transition.ts,
// pages/sdlc/api/cockpit/ticket-status.ts) and could drift.
//
// Membership mirrors the tickets_status_check constraint installed by
// lib/tickets/migrations.ts (order there: 'in_review','blocked','qa_review';
// here qa_review precedes blocked — the order all three consumers shared).
// Pure module: imports nothing, so tests and components can import it without
// booting the pg Pool.

export const TICKET_STATUSES = [
  'triage',
  'planning',
  'plan_staged',
  'backlog',
  'in_progress',
  'in_review',
  'qa_review',
  'blocked',
  'awaiting_deploy',
  'done',
  'archived',
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const VALID_STATUSES: ReadonlySet<TicketStatus> = new Set(TICKET_STATUSES);

export function isValidStatus(s: string): s is TicketStatus {
  return VALID_STATUSES.has(s as TicketStatus);
}
