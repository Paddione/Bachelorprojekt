# Proposal: ticket-ops-stale-triage

## Why

Der freigegebene Wave-1-Dispatch der ticket-ops-Session lief auf dem Triage-Snapshot von 21:19 —
beim Agentenstart waren 2 von 3 Tickets bereits von Parallelsessions übernommen (T005591 →
`plan_staged`, T005560 → `in_progress`). Beide Planungsagenten brachen sauber ab; Kosten: 2
opus-Agentenläufe (~250k Tokens). Die bestehende Pre-Check-Invariante [T002422]/[T002498-M6]
prüft nur Agent-Locks — `stage-plan` und `update-status` ändern den Ticket-Zustand aber ohne
irgendeinen Lock. Der Lock-Pre-Check ist gegen genau diese Übernahme-Form blind.

## What

- **Prozedur:** In `ticket-ops-procedures.md` §Step 3.6 wird VOR der Claim-Schleife ein
  Ticket-State-Recheck dokumentiert: eine billige Query über `tickets.tickets` (`status`) plus
  die `FACTORY-PLAN-REF`-Kommentar-Existenz in `tickets.ticket_comments`. Nur Tickets, deren
  Zustand seit dem Masterplan-Snapshot unverändert ist, werden dispatched; veränderte Tickets
  werden als `STALE-STATE` gemeldet und ausgeschlossen.
- **Skill-Invariante:** `ticket-ops/SKILL.md` Phase 3 trägt den Verweis auf den State-Recheck
  neben der Pre-Check-Invariante [T002422].
- **SSOT:** `openspec/specs/ticket-ops.md` bekommt per Delta-Spec ein ADDED-Requirement.
- **Guard:** `tests/spec/ticket-ops/wave1-state-refetch.bats` sichert die Prozedur-Dokumentation
  ab (grep-Modus, Dokumentationskonvention).

_Ticket: T006295_
