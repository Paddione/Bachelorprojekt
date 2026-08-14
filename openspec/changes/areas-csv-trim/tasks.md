---
title: "areas-csv-trim — Implementation Plan"
ticket_id: T004894
domains: [bachelorprojekt-test, tickets]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# areas-csv-trim — Implementation Plan

_Ticket: T004894_

## File Structure

| Datei | Ist | Budget |
|---|---|---|
| `scripts/ticket.sh` | 1122 | — (s1.ignore, gates.yaml) |
| `scripts/vda/ticket/create.sh` | 146 | 650 (Limit 800, nicht baselined) |
| `tests/spec/ticket-system/areas-csv-trim.bats` | 90 (in dieser PR bereits angelegt) | — |
| `openspec/changes/areas-csv-trim/specs/ticket-system.md` | Delta-Spec | — |
| `website/src/data/test-inventory.json` | Generat | — |

Zu den Budgets: `scripts/ticket.sh` steht namentlich auf der s1.ignore-Liste in
`docs/code-quality/gates.yaml` (sanktionierte Single-File-CLI) — kein S1-Gate. Für
`scripts/vda/ticket/create.sh` gilt das statische `.sh`-Limit 800; der Fix ersetzt
eine SQL-Zeile (zeilenneutral) — reichlich Reserve. `.bats` und `.md` sind nicht
S1-gated; für sie wird bewusst keine Zahl behauptet.

Kontext: Die Root-Cause-Analyse (Symptom vs. Hypothese, Code-Belege) steht in
`proposal.md`; sie widerlegt die Ticket-Annahme „Append-Mechanismus in
mishap-tracker.sh" — der Defekt sitzt in der CSV→ARRAY-Konversion
(`_csv_to_quoted` in `scripts/ticket.sh` und `string_to_array` in
`scripts/vda/ticket/create.sh`), die Einzelwerte nicht trimmt.

Merge-Reihenfolge-Hinweis: Der plan_staged-Branch `fix/mishap-container-detect-real-db-T004893`
(Welle 1) berührt andere Dateien (`scripts/hooks/mishap-tracker.sh`,
`tests/spec/mishap-rollup/`). Einziger gemeinsamer Punkt ist
`website/src/data/test-inventory.json` — beim Merge des zweiten PRs neu
regenerieren. Keine T004893-Änderungen werden hier übernommen.

## Task 1 — RED: der Failing-Test liegt vor und ist rot

Die Testdatei `tests/spec/ticket-system/areas-csv-trim.bats` liegt bereits auf dem
Branch (mit diesem Plan gestaged). Sie ist real-DB-basiert (Muster
`backfill-id-sequence.bats`): sie führt `plan-meta set --areas "tickets, db"` bzw.
`create --areas "tickets, db"` AUS und prüft das gespeicherte Array per psql gegen
`{tickets,db}` (Output-Verifikation, T002448-M4). Ohne Cluster skippt sie sauber
(T002820: `cluster_running || skip` im Test).

Ausführen und den roten Zustand belegen — lokaler Lauf gegen k3d:

```bash
tests/unit/lib/bats-core/bin/bats --count tests/spec/ticket-system/areas-csv-trim.bats
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system/areas-csv-trim.bats
# expected: FAIL — beide Tests rot: psql liefert {tickets," db"} statt {tickets,db}
```

Die Ausgabe prüfen, nicht nur den Exit-Code: erwartet sind zwei `not ok`-Zeilen mit
`{tickets," db"}` im Befund. Am 2026-08-14 verifiziert (RED-Lauf vor dem Plan).

## Task 2 — GREEN Teil 1: `_csv_to_quoted()` trimmt Einzelwerte

In `scripts/ticket.sh` — `_csv_to_quoted()` (Z. 834–841): jedes Item vor dem Quoten
an den Rändern trimmen (führende und trailing Whitespace). Bash-nativ ohne externe
Tools:

```bash
# je Item nach dem Split:
item="${item#"${item%%[![:space:]]*}"}"   # führenden Whitespace entfernen
item="${item%"${item##*[![:space:]]}"}"   # trailing Whitespace entfernen
```

`_csv_to_quoted` speist `cmd_plan_meta` (Z. 812) — damit werden `--areas` UND
`--depends-on` getrimmt (derselbe Helper, dieselbe Fehlerklasse). `_pipe_to_quoted`
(requirements) bleibt unverändert: Pipes sind ein anderes Trennzeichen ohne
beobachteten Defekt (Scope-Entscheidung in `proposal.md`).

Hinweis: Die Änderung an `scripts/ticket.sh` ist netto +2 Zeilen; die Datei ist
s1.ignore — kein Budget-Risiko.

## Task 3 — GREEN Teil 2: `create.sh` konvertiert trimmend

In `scripts/vda/ticket/create.sh` (Z. 99) die areas-Konversion ersetzen:

```sql
CASE WHEN :'areas'='' THEN NULL
     ELSE regexp_split_to_array(btrim(:'areas'), '\s*,\s*') END
```

`regexp_split_to_array` mit `\s*,\s*` (PostgreSQL-ARE) konsumiert Whitespace um
jedes Komma; `btrim` sichert die Ränder des Gesamtstrings. Verhalten:
`'tickets, db'` → `{tickets,db}`. Dokumentierte Randfälle: leere Elemente
(`a,,b`) bleiben wie bisher erhalten; ein reiner Whitespace-String (`' '`)
erzeugt jetzt ein leeres Array statt eines Elements mit Space (pathologisch,
kein Aufrufer-Lieferfall — als Edge-Case in `design.md` notiert).

## Task 4 — GREEN: beide Guards laufen durch

Lokaler Lauf gegen k3d — beide Tests müssen grün sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system/areas-csv-trim.bats
# expected: PASS — 2/2 grün; psql liefert {tickets,db} für plan-meta UND create
```

Regressionsschutz: Die Assertion ist exakt (`{tickets,db}`) — ein erneutes
Einführen von Whitespace macht den Test sofort rot (Positiv-Anker,
T002356-M1). Zusätzlich die bestehende Suite gegen Ticket-Verhalten laufen
lassen (kein Regression in `plan-meta`):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system/update-fields-cli.bats tests/spec/ticket-system/backfill-id-sequence.bats
```

## Task 5 — Abschluss-Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

`task freshness:regenerate` aktualisiert `website/src/data/test-inventory.json` —
die neue Testdatei muss registriert und mitkommittet werden (CI-Gate
`test:inventory`). Danach PR über `dev-flow-execute` (kein PR aus dem
Plan-Stand, T002816).
