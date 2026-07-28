// Single source of truth for Cockpit enum display + transition logic.
// Pure module: NO imports, no store, no UI, no DB (S2-safe) — like cockpit-types.ts.
// Centralises the enum knowledge so every Cockpit component stays lean + consistent.

export const STATUS_LABELS: Record<string, string> = {
  triage: 'Triage',
  planning: 'Planung',
  plan_staged: 'Plan bereit',
  backlog: 'Backlog',
  in_progress: 'In Arbeit',
  in_review: 'Review',
  qa_review: 'QA-Review',
  blocked: 'Blockiert',
  awaiting_deploy: 'Wartet auf Deploy',
  done: 'Erledigt',
  archived: 'Archiviert',
};

const PRIORITY_LABELS: Record<string, string> = {
  niedrig: 'Niedrig', mittel: 'Mittel', hoch: 'Hoch', kritisch: 'Kritisch',
};

// Conventional-Commit-Vokabular [T002329]. Die drei Altwerte bleiben gelistet,
// bis Teil D (T002331) sie aus dem DB-CHECK entfernt — historische Zeilen tragen
// sie weiter, und ein Ticket ohne Beschriftung ist im Cockpit unlesbar.
const TYPE_LABELS: Record<string, string> = {
  fix: 'Fix', feat: 'Feature', chore: 'Aufgabe', project: 'Projekt',
  docs: 'Doku', refactor: 'Refactoring', perf: 'Performance',
  test: 'Test', ci: 'CI', build: 'Build',
  task: 'Aufgabe', bug: 'Bug', feature: 'Feature',
};

const RESOLUTION_LABELS: Record<string, string> = {
  fixed: 'Behoben', shipped: 'Ausgeliefert', wontfix: 'Wontfix',
  duplicate: 'Duplikat', cant_reproduce: 'Nicht reproduzierbar', obsolete: 'Obsolet',
};

export const ALL_PRIORITIES = ['niedrig', 'mittel', 'hoch', 'kritisch'] as const;

// Curated statuses offered in the table-row select: only those that actually occur
// and that a PM toggles directly. Excludes workflow-internal plan_staged/qa_review.
export const WORKFLOW_STATUSES =
  ['triage', 'backlog', 'in_progress', 'in_review', 'blocked', 'awaiting_deploy', 'done'] as const;

const TERMINAL = new Set(['done', 'archived']);

// Active = anything not yet closed/archived. Drives the table's default filter.
export const ACTIVE_STATUSES = Object.keys(STATUS_LABELS).filter((s) => !TERMINAL.has(s));

export function isTerminal(status: string): boolean { return TERMINAL.has(status); }

export function statusLabel(s: string): string { return STATUS_LABELS[s] ?? s; }
export function priorityLabel(p: string): string { return PRIORITY_LABELS[p] ?? p; }
export function typeLabel(t: string): string { return TYPE_LABELS[t] ?? t; }
export function resolutionLabel(r: string): string { return RESOLUTION_LABELS[r] ?? r; }

// done/archived require a resolution server-side (transition.ts §44). Pick a
// sensible default by ticket type so a one-click "Erledigt" succeeds instead of 400.
export function defaultResolutionFor(type: string): string {
  // Muss deckungsgleich mit scripts/factory/auto-close-merged.sh bleiben, sonst
  // weichen Cockpit-Anzeige und automatischer Merge-Abschluss voneinander ab.
  return type === 'bug' || type === 'fix' ? 'fixed' : 'shipped';
}

// State-aware next statuses for the drawer. Permissive but excludes the current
// status and workflow-internal targets the /transition route rejects.
export function nextTransitions(status: string): string[] {
  if (isTerminal(status)) return ['in_progress']; // reopen
  return ['in_progress', 'in_review', 'blocked', 'done'].filter((s) => s !== status);
}
