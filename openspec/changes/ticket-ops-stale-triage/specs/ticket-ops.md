## ADDED Requirements

### Requirement: Wave-1-Dispatch re-fetcht den Ticket-Zustand vor dem Dispatch

The ticket-ops dispatch procedure in ticket-ops-procedures.md §Step 3.6 SHALL re-fetch the
ticket state of EVERY wave-1 ticket before the first claim call of the dispatch loop: one cheap
query over `tickets.tickets` (column `status`) plus the existence of a `FACTORY-PLAN-REF`
comment in `tickets.ticket_comments` (the marker `stage-plan` writes). Only tickets whose
re-fetched state is unchanged since the masterplan snapshot SHALL be dispatched; tickets whose
state differs (status mismatch or a now-existing `FACTORY-PLAN-REF` comment, e.g. `plan_staged`
or `in_progress` set by a parallel session) SHALL be reported as `STALE-STATE` and excluded from
the dispatch. The SKILL.md Phase 3 invariant section SHALL reference this state re-check next to
the agent-lock pre-check invariant [T002422].

#### Scenario: Ticket wurde seit dem Masterplan von einer Parallelsession übernommen

- **GIVEN** ein Wave-1-Ticket, das im Masterplan-Snapshot `triage` war
- **WHEN** der Dispatch vor der Claim-Schleife den Ticket-Zustand re-fetcht
- **THEN** der re-fetchte Status weicht vom Snapshot ab oder ein `FACTORY-PLAN-REF`-Kommentar existiert
- **AND** das Ticket wird als `STALE-STATE` gemeldet und nicht dispatched

#### Scenario: Unverändertes Ticket wird weiterhin dispatched

- **GIVEN** ein Wave-1-Ticket, dessen Zustand seit dem Masterplan-Snapshot unverändert ist
- **WHEN** der Dispatch vor der Claim-Schleife den Ticket-Zustand re-fetcht
- **THEN** das Ticket bleibt in der Dispatch-Menge und durchläuft die Claim-Schleife

#### Scenario: SKILL.md verweist auf den State-Recheck

- **GIVEN** ein Agent liest nur die ticket-ops SKILL.md (nicht die Referenz)
- **WHEN** die Invarianten-Sektion von Phase 3 geprüft wird
- **THEN** sie verweist neben der Pre-Check-Invariante [T002422] auf den Ticket-State-Recheck
