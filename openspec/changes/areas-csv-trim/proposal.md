# Proposal: areas-csv-trim

## Why

Der Rollup-Container T003533 trug `areas=['tickets',' db']` — der zweite Eintrag mit
führendem Leerzeichen. Verifiziert am 2026-08-14 per DB-Query
(`SELECT external_id, areas FROM tickets.tickets WHERE external_id='T003533'`).
Das Ticket nahm an, die Ursache liege im "Append-Mechanismus" des Mishap-Rollups
(T002448-M5: Symptom vs. Hypothese trennen). Die Ursachen-Analyse widerlegt diese
Hypothese in ihrer konkreten Form und findet die tatsächliche Wurzel.

## What

### Root-Cause (verifiziert, T002448-M5)

**Symptom (Fakt):** `areas`-Einträge mit führendem Leerzeichen auf dem Rollup-Container
T003533. Die DB-Query über ALLE Tickets zeigt: das Muster ist breit — mindestens
T002448 (`" CLAUDE.md Testkonventionen"`), T002471 (`" post-commit"`), T001607 (`" ci"`),
T002808, T003073, T003229 und T003533 tragen Einträge mit führendem Leerzeichen.

**Ursache (Code-Beleg):** Die CSV→ARRAY-Konversion trimmt keine Einzelwerte:

1. `scripts/ticket.sh` — `_csv_to_quoted()` (Z. 834–841): splittet an `IFS=','`, jedes
   Item wird unverändert übernommen (`item="${item//\'/\'\'}"`, kein Trim). Aufrufer
   `cmd_plan_meta` (Z. 812): `ARRAY[$(_csv_to_quoted "$areas")]`. Eine übergebene Liste
   `tickets, db` erzeugt damit `ARRAY['tickets', ' db']`. `plan-meta set` ist der
   **einzige areas-Update-Pfad** (es gibt keinen separaten areas-Append-Wrapper).
2. `scripts/vda/ticket/create.sh` (Z. 99): `string_to_array(:'areas', ',')` — Anlage-Pfad,
   ebenfalls ohne Trim.

**Beleg für den Container-Fall:** T003533 wurde am 2026-08-10 via
`ticket.sh rollup-container` OHNE `--areas` angelegt (areas war null); `updated_at`
(2026-08-14 10:14) zeigt das spätere Setzen — konsistent mit einem `plan-meta`-Aufruf,
der eine Komma-Liste mit Leerzeichen enthielt.

**Kein areas-Schreiben im Rollup-Pfad:** `scripts/hooks/mishap-tracker.sh` enthält keine
areas-Logik (46 Zeilen, nur Kommentar-/Log-Append). `appendToRollupContainer`
(`scripts/ticket-mcp/go/internal/tools/mishap.go`) hängt ausschließlich Kommentare an den
Container und ändert `areas` nie. Die im Ticket genannte Ziel-Datei
`scripts/hooks/mishap-tracker.sh` ist damit **nicht** der richtige Fix-Ort — der Fix
gehört in die CSV→ARRAY-Konversionen.

### Fix-Design

1. **`_csv_to_quoted()`** (scripts/ticket.sh): jedes Item an den Rändern trimmen
   (führende/trailing Whitespace), bevor es gequotet wird. Behebt `plan-meta set --areas`
   UND `--depends-on` (derselbe Helper). Wirkt für alle künftigen Aufrufer.
2. **`scripts/vda/ticket/create.sh` Z. 99**: `string_to_array(:'areas', ',')` durch
   trimmende Konversion ersetzen (SQL-seitig `regexp_split_to_array(:'areas', '\s*,\s*')`
   oder gleichwertig Bash-seitig) — Anlage-Pfad.
3. **Keine Datenmigration:** historische, überwiegend abgeschlossene Tickets bleiben
   unangetastet (bewusst nicht per psql geflickt — wie im Ticket festgehalten). Der Fix
   verhindert Neuauftreten (Prozess-Fix).

### Scope-Entscheidungen

- **Nicht im Scope:** `touched_files`-Konversionen (`scripts/ticket.sh` Z. 406/742,
  `stage-plan.sh` Z. 116) — dieselbe Klasse, aber kein beobachteter Defekt; Scope-Creep
  vermeiden. Wird hier nur als bekannte gleichartige Stelle notiert.
- **Kein Verhaltenswechsel:** leere Elemente (`a,,b`) bleiben wie bisher erhalten; nur
  Whitespace um Kommas verschwindet.
- **Guard-Test:** real-DB-BATS unter `tests/spec/ticket-system/` (Muster
  `backfill-id-sequence.bats`), Output-Verifikation (T002448-M4): `plan-meta set` bzw.
  `create` AUSFÜHREN und das gespeicherte Array per psql prüfen.

### Merge-Reihenfolge-Konsequenz (T004893)

Der plan_staged-Branch `fix/mishap-container-detect-real-db-T004893` (Welle 1) ändert
`scripts/hooks/mishap-tracker.sh` und legt `tests/spec/mishap-rollup/container-resolution-real-db.bats`
an. Keine Datei-Überlappung mit diesem Fix (ticket.sh, create.sh, tests/spec/ticket-system/).
Einziger gemeinsamer Berührungspunkt: `website/src/data/test-inventory.json` — beide
Branches regenerieren es (`task freshness:regenerate`). Beim Merge des ZWEITEN PRs ist
die Inventar-Datei neu zu regenerieren und mitzukommitten (Konflikt-Auflösung). Keine
T004893-Änderungen werden hier übernommen.

### Tests

- `tests/spec/ticket-system/areas-csv-trim.bats` — RED: `plan-meta set --areas "tickets, db"`
  speichert heute `['tickets',' db']` (führendes Leerzeichen) → Test rot. GREEN nach Fix:
  `['tickets','db']`. Zweiter Fall: `create --areas "tickets, db"`. Verfügbarkeits-Guard
  (T002820): ohne erreichbaren k3d-Cluster → skip.

_Ticket: T004894_
