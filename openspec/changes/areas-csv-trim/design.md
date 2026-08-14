---
status: plan_staged
domains: test,tickets
---

# Design: areas-csv-trim

## Root-Cause

Symptom: areas-Einträge mit führendem Leerzeichen (`' db'`) auf dem Rollup-Container
T003533 (DB-verifiziert; breites Muster über 7 Tickets). Ursache: Die CSV→ARRAY-
Konversion trimmt keine Einzelwerte — `_csv_to_quoted()` in `scripts/ticket.sh`
(`plan-meta set` areas/depends_on, Z. 812/834) und `string_to_array(:'areas', ',')` in
`scripts/vda/ticket/create.sh` (Z. 99). `plan-meta set` ist der einzige areas-Update-Pfad;
`mishap-tracker.sh` und der Container-Append (mishap.go) schreiben areas nie.

## Fix-Ansatz

1. `_csv_to_quoted()`: Items an den Rändern trimmen (bash-nativ, keine externen Tools).
2. `create.sh` Z. 99: `string_to_array(:'areas', ',')` → trimmende Konversion
   (`regexp_split_to_array(:'areas', '\s*,\s*')`, PostgreSQL-ARE).
3. Keine Migration historischer Zeilen; kein touched_files-Scope.

## Subsysteme

- `scripts/ticket.sh` (plan-meta) — Update-Pfad
- `scripts/vda/ticket/create.sh` — Anlage-Pfad
- `tests/spec/ticket-system/areas-csv-trim.bats` — real-DB-Guard (RED→GREEN)

## Edge-Cases

- `a,,b` → leere Elemente bleiben (Verhalten unverändert).
- `"tickets"` ohne Komma → unverändert ein Element.
- Nur-Whitespace-Items (`" , "`) → werden zu leeren Elementen (pathologisch, nicht
  relevant für den Fix; kein zusätzlicher Filter).
- `_pipe_to_quoted` (requirements) bleibt unverändert — Pipes sind ein anderes
  Trennzeichen ohne beobachteten Defekt.
