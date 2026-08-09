---
title: "fix-watchdog-sf26-vakuos-T002620 — Implementation Plan"
ticket_id: T002620
domains: [bachelorprojekt-test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-watchdog-sf26-vakuos-T002620 — Implementation Plan

Behebt T002620: die beiden FA-SF-26-Live-Tests in
`tests/spec/software-factory/scheduling.bats` (Zeilen 160–199) datieren `updated_at`
zurueck, um ein stale Ticket zu erzeugen — der Trigger `tickets.fn_lifecycle_ts`
ueberschreibt das bei jedem UPDATE mit `now()`, die Stale-Liste bleibt leer und der
Watchdog-Eskalationspfad ist faktisch ungetestet. Entwurf und Begruendung:
[`design.md`](design.md), [`proposal.md`](proposal.md).

_Ticket: T002620_

## File Structure

| Datei | Ist-Zeilen | S1-Budget | Art |
|---|---|---|---|
| `tests/spec/software-factory/scheduling.bats` | 281 | — (`.bats` hat kein S1-Limit) | geaendert (FA-SF-26-Block, Zeilen 160–199) |

Nur eine Datei, nur die Tests-Rolle — deshalb genau ein Partial. Keine Produktaenderung:
`watchdog.sh` ist intakt (T002618 seit T002610 behoben), er wurde nur nie ausgefuehrt.

## Partials

| # | Pfad | Rolle | Targets | Deps |
|---|------|-------|---------|------|
| P1 | `tasks.d/p1-sf26-vakuos-tests.md` | tests | `tests/spec/software-factory/scheduling.bats` | |

## Verify

1. `bash scripts/plan-lint.sh openspec/changes/fix-watchdog-sf26-vakuos-T002620/tasks.md` → PASS
2. Diagnose (live, gegen Dev-Cluster): SQL-Probe belegt, dass das Backdating den
   Trigger nicht ueberlebt; der Bestandstest scheitert mit leerer Stale-Liste (RED)
3. Nach dem Umbau: derselbe `bats`-Lauf ist gruen (GREEN), das JSON-Array enthaelt die ext_id
4. Offline-Gate: `task test:changed` + `task freshness:regenerate` + `task freshness:check`
   gruen (Live-Tests skippen ohne Cluster)
