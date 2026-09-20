---
title: "get-timeline-plan-brand-column — Implementation Plan"
ticket_id: T900243
domains: [plan-authoring]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# get-timeline-plan-brand-column — Implementation Plan

_Ticket: T900243_

## File Structure

```
tests/spec/ticket-system/get-timeline-plan-brand-column-T900243.bats  (new, already committed on this branch)
scripts/ticket.sh                                                     (modified, 1 line removed)
```

`scripts/ticket.sh`: Ist 1138 Zeilen · statisches `.sh`-Limit 800 (nicht in
`docs/code-quality/baseline.json` gebaselined). Diese Änderung entfernt
netto eine Zeile (`AND tp.brand = :'brand'`) und fügt keine hinzu —
zeilenneutral im negativen Sinn, kein Risiko für S1.

## Task 1: Root-Cause bestätigen und Bugfix anwenden (RED → GREEN)

**Symptom vs. Ursache (Bug-Triage-Pflicht):** Symptom ist `get-timeline --id
<id>` bricht mit Exit 3 ab ("column tp.brand does not exist"). Ursache ist in
der `plan_events`-CTE von `cmd_get_timeline` (`scripts/ticket.sh`, aktuell
Zeile ~1013-1020): sie filtert `tickets.ticket_plans` zusätzlich auf
`tp.brand = :'brand'` — diese Spalte existiert auf `ticket_plans` nicht
(`tp.branch` ist eine andere, real existierende Spalte mit anderer
Bedeutung — Verwechslungstippfehler, kein Alias).

**Entscheidung (aus dem Ticket, nicht neu zu verhandeln):** Die Bedingung
wird ersatzlos gestrichen — NICHT `brand` durch `branch` ersetzt (das wäre
syntaktisch grün, aber semantisch Unsinn: `branch` ist der Git-Branch-Name
des Plans, kein Brand-Diskriminator). Begründung: die CTE ist bereits über
`tp.ticket_id = (SELECT id FROM tickets.tickets WHERE external_id = :'ext_id')`
auf genau ein Ticket eingeschränkt, und `external_id` ist pro Brand
eindeutig — ein zusätzlicher Brand-Filter auf dem Plan-Datensatz ist
redundant. Die drei Schwester-CTEs (`comments`, `phase_events`, `pr_links`)
filtern ebenfalls nur über den Ticket-Subselect, ohne eigenen Brand-Filter —
`plan_events` zieht damit nach, statt eine Sonderregel zu behalten.

- [x] **Failing-Test-Step (RED).** Der Test ist bereits auf diesem Branch
      committed (`tests/spec/ticket-system/get-timeline-plan-brand-column-T900243.bats`).
      Er führt `ticket.sh get-timeline --id T900239` (mentolder, hat einen
      archivierten Plan) gegen die echte Fleet-DB aus und prüft Exit 0 UND
      einen `plan_archived`-Eintrag in der Ausgabe — nicht nur die
      Abwesenheit eines Fehlers.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system/get-timeline-plan-brand-column-T900243.bats
# expected: FAIL (red — "column tp.brand does not exist", rc=3)
```

- [x] **Fix-Step (GREEN).** In `scripts/ticket.sh`, `cmd_get_timeline`,
      `plan_events`-CTE: die Zeile `AND tp.brand = :'brand'` entfernen. Die
      CTE bleibt sonst unverändert (weiterhin `WHERE tp.ticket_id = (...)
      AND tp.archived_at IS NOT NULL`).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system/get-timeline-plan-brand-column-T900243.bats
# expected: PASS (green)
```

## Task 2: Finale Verifikation

- [x] Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
