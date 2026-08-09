# T002769: plan_staged-Guard in mishap.go

## Problem

`mishap.go` `buildFactoryFixTicketArgs()` erzeugt Fix-Tickets mit `--status plan_staged`, obwohl
kein Plan existiert. Die Tickets (T002767–T002774, 8 Stück am 2026-08-09) blockieren die
Factory-Queue: `dev-flow-execute` findet keinen Plan, `reconcile-ticket-status.sh` Pattern 4
flagt sie als `attention_mode=needs_human`.

Die Plan-Existenz wird an keiner Stelle vor dem Statuswechsel geprüft. `stage-plan.sh` hat einen
Guard (`--plan` required, `git cat-file -e` check), aber `mishap.go` ruft `stage-plan` nie auf —
es schreibt den Status direkt via `ticket.sh create --status plan_staged`.

## Root Cause

`mishap.go:175`: `"--status", "plan_staged"` in `buildFactoryFixTicketArgs()`. Der Kommentar
(Z. 163–168) behauptet, die Factory handle `plan_staged`-Tickets ohne `FACTORY-PLAN-REF` via
Scout→Design→Plan — aber `reconcile-ticket-status.sh` Pattern 4 widerlegt das: genau diese
Tickets werden als `needs_human` geflagt, nicht dispatched.

## Fix

`buildFactoryFixTicketArgs()`: `--status plan_staged` → `--status triage`.

Die Tickets durchlaufen danach den normalen Planungs-Flow (triage → planning → plan_staged →
backlog), in dem die Plan-Existenz durch `stage-plan.sh` garantiert wird.

Kein DB-Guard nötig — `stage-plan.sh` ist bereits fail-closed (erfordert `--plan` und prüft
`git cat-file -e`). Der Fehler lag im Bypass dieses Guards durch `mishap.go`.

## Nicht betroffen

- `buildCreateRollupTicketArgs()`: Der Rollup-Container (`Mishap Rollup — fortlaufende Sammlung`)
  bleibt `plan_staged`. Er wird von `mishap-rollup.sh` verwaltet, das selbst einen Plan erzeugt.
- `buildFindRollupTicketArgs()`: Sucht weiter nach `plan_staged` Chore-Tickets (Container-Suche).
- `buildIncidentTicketArgs()`: Incident-Tickets sind `triage` — bereits korrekt.
