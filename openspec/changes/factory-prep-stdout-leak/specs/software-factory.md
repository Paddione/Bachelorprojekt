## ADDED Requirements

### Requirement: PREP-stdout traegt ausschliesslich den Launch-Plan

`scripts/vda/factory-prep.sh` SHALL write nothing to stdout except the single
closing JSON document `{launch, skipped}`. Every subprocess it invokes — in
particular `ticket.sh release-slot`, `ticket.sh update-status`, `ticket.sh get`,
`ticket.sh factory-control` and `worktree-create.sh` — SHALL have its stdout
captured or redirected to `/dev/null`; diagnostics belong on stderr via `log()`.

`scripts/factory/wakeup.sh` SHALL NOT silence the `jq` parse step that converts
that stdout into the prep file. The `null` fallback MAY remain so a broken PREP
does not abort the tick, but the parse failure and the head of the unreadable
stream SHALL be reported on stderr.

#### Scenario: SKIP-Pfad haelt den JSON-Stream intakt

- **GIVEN** ein Ticket wurde geschedult und sein Slot geclaimt
- **WHEN** der Worktree-Pre-Create fehlschlaegt und `factory-prep` deshalb den
  Slot wieder freigibt
- **THEN** ist das stdout von `factory-prep` fuer sich genommen gueltiges JSON
  (`jq -e .` mit Exit 0), und `.skipped` traegt den Grund `worktree_failed`

#### Scenario: Launch-Plan eines Ticks ueberlebt ein einzelnes uebersprungenes Ticket

- **GIVEN** ein Tick mit mehreren schedulebaren Tickets
- **WHEN** genau eines davon uebersprungen wird
- **THEN** enthaelt `.launch` weiterhin die uebrigen Tickets, und
  `dispatcher-bridge.sh` startet sie

#### Scenario: Unlesbarer Prep-Stream wird im Journal sichtbar

- **GIVEN** `factory-prep` liefert aus irgendeinem Grund kein gueltiges JSON
- **WHEN** `wakeup.sh` den Tick vorbereitet
- **THEN** faellt die Prep-Datei auf `null` zurueck UND `wakeup.sh` meldet den
  Parse-Fehler samt Kopf des Streams auf stderr

### Requirement: Slot-Freigabe im PREP stellt den Vorzustand her

When `scripts/vda/factory-prep.sh` releases a slot it has just claimed — because
the ticket is held by a live interactive session, or because the worktree
pre-create failed — it SHALL also restore the ticket status that `slots.sh claim`
overwrote with `in_progress`: `plan_staged` when the ticket carries a `plan_ref`,
`backlog` otherwise. A ticket SHALL NOT be left on `in_progress` without a
`pipeline_slot`, because `queue.sh` selects only `backlog` and `plan_staged` and
such a ticket can never be scheduled again.

The restore SHALL live at the PREP call site, not inside `ticket.sh release-slot`:
that command is a generic primitive whose other callers (`watchdog.sh`,
`pipeline-runner.js`, `dispatcher.js`, `ticket-reclaim.sh`) target entirely
different statuses.

#### Scenario: Uebersprungenes Ticket bleibt schedulebar

- **GIVEN** ein `plan_staged`-Ticket, dessen Slot im PREP-SKIP wieder freigegeben wird
- **WHEN** der naechste Tick die Queue pollt
- **THEN** steht das Ticket wieder auf `plan_staged` und erscheint erneut in `queue.sh`
