## ADDED Requirements

### Requirement: Deterministische Phase-Event-Auto-Emission bei Status-Transitions

The system SHALL emit `tickets.factory_phase_events` rows as a deterministic side effect of every ticket status transition and every plan-staging, so that dev-flow-execute runs become visible on the factory floor without relying on agent-issued telemetry instructions. Emission SHALL happen inside `scripts/vda/ticket/update-status.sh` and `scripts/vda/ticket/stage-plan.sh` (covering both the CLI and the MCP `transition_status` path, which shells out to `ticket.sh update-status`). The status→event mapping SHALL be: `plan_staged`-staging → `scout done` + `design done` + `plan done`; `in_progress` → `implement entered`; `in_review` → `implement done`; `qa_review` → `verify entered`; `done` → `deploy done`; `blocked` → the ticket's most recent phase (SQL lookup, fallback `implement`) in state `blocked`. Emission SHALL be idempotent via a `NOT EXISTS` dedup on `(ticket_id, phase, state)`, SHALL attribute the driver from the `TICKET_PHASE_DRIVER` environment variable (default `devflow`, only `factory`|`devflow` accepted), SHALL set `detail = 'auto: <trigger>'`, and SHALL NOT make the status transition fail when telemetry cannot be written.

#### Scenario: Status-Transition emittiert das gemappte Phase-Event

- **GIVEN** ein Ticket `T000001` existiert und ein `kubectl`/`psql`-Stub erfasst die abgesetzte SQL
- **WHEN** `ticket.sh update-status --id T000001 --status done` läuft
- **THEN** die erfasste SQL enthält einen `INSERT INTO tickets.factory_phase_events` mit `deploy` / `done`, einen `NOT EXISTS`-Dedup auf `(ticket_id, phase, state)` und `detail` mit dem Präfix `auto:`; `in_progress` mappt auf `implement`/`entered`, `in_review` auf `implement`/`done`, `qa_review` auf `verify`/`entered`

#### Scenario: Driver aus TICKET_PHASE_DRIVER, Default devflow, offline-skip

- **GIVEN** `TICKET_PHASE_DRIVER=factory` ist gesetzt und ein Stub erfasst die SQL
- **WHEN** `ticket.sh update-status --id T000001 --status in_progress` läuft
- **THEN** die erfasste SQL setzt `driver` auf `factory`; ohne die Variable wird `devflow` verwendet; unter `TICKET_OFFLINE=1` wird der Statuswechsel per Dispatcher-Guard übersprungen und keine `kubectl`-Emission ausgeführt

#### Scenario: Plan-Staging emittiert scout/design/plan done idempotent

- **GIVEN** ein Ticket `T000001` und ein SQL-erfassender Stub
- **WHEN** `ticket.sh stage-plan --id T000001 --branch feature/x --plan openspec/changes/x/tasks.md` läuft
- **THEN** die erfasste SQL emittiert `scout`, `design` und `plan` je in State `done` über einen `CROSS JOIN (VALUES …)` mit `NOT EXISTS`-Dedup und `detail` mit Präfix `auto:`

---

### Requirement: Fail-closed Phase-Chain Assertion Gate

The system SHALL provide a `ticket.sh assert-phase-chain --id <ext_id> [--json]` subcommand (sourced module `scripts/vda/ticket/assert-phase-chain.sh`) that verifies the presence of the phase events `plan:done`, `implement:entered`, and `verify:done` for a ticket (any driver). Argument validation (missing `--id`) SHALL happen before any cluster call and exit 2 (FA-SF-48 convention). When one or more required events are missing, the command SHALL exit 1 and print the exact backfill commands (`./scripts/ticket.sh phase <ext_id> <phase> <state> --driver devflow --detail "…"`) for each gap; when all are present it SHALL exit 0. The `--json` flag SHALL emit `{"ok":<bool>,"missing":[…]}`. `dev-flow-execute` SHALL invoke this gate as a mandatory step before `gh pr merge` without an `|| true` suppression.

#### Scenario: Fehlendes --id wird vor dem Cluster-Call abgewiesen

- **GIVEN** kein Cluster ist erreichbar (offline)
- **WHEN** `ticket.sh assert-phase-chain` ohne `--id` aufgerufen wird
- **THEN** Exit 2 mit `--id is required`; die Validierung erfolgt vor `_pgpod`

#### Scenario: Vollständige Kette besteht, Lücke schlägt fehl mit Backfill-Hinweisen

- **GIVEN** ein `kubectl`-Stub liefert für `T000001` die Zeilen `plan:done`, `implement:entered`, `verify:done`
- **WHEN** `ticket.sh assert-phase-chain --id T000001` läuft
- **THEN** Exit 0; liefert der Stub nur `plan:done` und `implement:entered`, dann Exit 1 und die Ausgabe enthält `ticket.sh phase T000001 verify done`

#### Scenario: --json liefert maschinenlesbaren Status

- **GIVEN** ein `kubectl`-Stub liefert nur `plan:done` für `T000001`
- **WHEN** `ticket.sh assert-phase-chain --id T000001 --json` läuft
- **THEN** die Ausgabe ist `{"ok":false,"missing":["implement:entered","verify:done"]}` und der Exit-Code ist 1; bei vollständiger Kette lautet die Ausgabe `{"ok":true,"missing":[]}` mit Exit 0

---

### Requirement: Versand-Lane SSOT-Label und entkoppelte-Deploy-Semantik

The system SHALL define the `shipped` lane display label once in `website/src/lib/tickets/pipeline-order.ts` as `Versand`, and `website/src/components/factory/ShippedColumn.svelte` SHALL import that label from the SSOT instead of hardcoding it. The Versand column SHALL render the subtitle `Gemergt nach main · Prod-Deploy entkoppelt` to communicate that shipped means merged (status `done`), not necessarily production-live (ADR-005 Merge = Abschluss). The empty-state text SHALL remain `Noch nichts versandt.`.

#### Scenario: Label wird aus der SSOT bezogen

- **GIVEN** `PIPELINE_LANES` aus `pipeline-order.ts` ist geladen
- **WHEN** der `shipped`-Lane-Eintrag geprüft wird
- **THEN** dessen `label` ist `Versand`; `ShippedColumn.svelte` rendert dieses Label ohne eigenes String-Literal und zeigt den Untertitel `Gemergt nach main · Prod-Deploy entkoppelt`

#### Scenario: Bucket-Zuordnung bleibt stabil

- **GIVEN** die abgeleitete `STATUS_BUCKETS`-Map
- **WHEN** `STATUS_BUCKETS.done` ausgewertet wird
- **THEN** der Wert ist `shipped` (Label-Änderung ändert die key-basierte Bucket-Ableitung nicht)
