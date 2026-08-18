// components/website/src/lib/tickets/status.ts
//
// Ticket status vocabulary SSOT (T007955). This is the SINGLE place that
// declares the 11 canonical ticket statuses; every other module imports from
// here instead of re-declaring the union. Previously the vocabulary was
// duplicated three times (lib/tickets/admin.ts, lib/tickets/transition.ts,
// pages/sdlc/api/cockpit/ticket-status.ts) and could drift.
//
// The VALUES live in ./statuses.json — the machine-readable source shared with
// the shell tooling (scripts/vda/ticket/triage.sh validates against the same
// file). TICKET_STATUSES IS that JSON array; the literal tuple below is a
// compile-time contract for the literal union type, not a runtime duplicate.
//
// The tickets_status_check DB constraint is built from this module (see
// lib/tickets/migrations.ts), so constraint and union cannot drift either.
// Pure module: imports no runtime modules (JSON data only), so tests and
// components can import it without booting the pg Pool.
import statusValues from './statuses.json';

export const TICKET_STATUSES = statusValues as unknown as readonly [
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
];

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const VALID_STATUSES: ReadonlySet<TicketStatus> = new Set(TICKET_STATUSES);

export function isValidStatus(s: string): s is TicketStatus {
  return VALID_STATUSES.has(s as TicketStatus);
}
