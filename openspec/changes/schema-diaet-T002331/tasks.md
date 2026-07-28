---
title: "schema-diaet-T002331 — Implementation Plan"
ticket_id: T002331
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: [bug-consolidation-T002330]
---

# schema-diaet-T002331 — Implementation Plan

_Ticket: T002331 · Letzter Teil (D) des Epics T002326 · Abhängig von T002330 (C)_

## Background

`tickets.tickets` hat 59 Spalten, davon ~27 tot (13× 100 % leer, 5× konstant,
9× < 2 % gefüllt). Alle tot-Spalten sind im Code referenziert. Der Rückbau
muss atomar in einem PR erfolgen (DB-Migration + Code-Änderungen).

Die Fillrate-Erhebung gegen die mentolder-Brand-DB (1787 Zeilen) ergab:

### 13 Spalten — 0 % belegt (NULL über alle Zeilen)

| Spalte | Typ | Code-Fundstellen (grobe Zählung) |
|--------|-----|----------------------------------|
| `ai_question` | TEXT | Cockpit-Feature-Suggest (migration sql) |
| `human_answer` | TEXT | Cockpit-Feature-Suggest (migration sql) |
| `due_date` | DATE | admin.ts, container-detail, audit-log |
| `estimate_minutes` | INTEGER | admin.ts, container-detail, audit-log |
| `scope` | TEXT | migrations.ts (ADD COLUMN), admin.ts |
| `source_test_assignment_id` | UUID | systemtest-linkback, failure-bridge, reconciler, cleanup |
| `source_test_question_id` | UUID | systemtest-linkback, failure-bridge, reconciler, cleanup |
| `source_test_run_id` | TEXT | systemtest-linkback |
| `source_test_result_id` | BIGINT | systemtest-linkback |
| `source_test_id` | TEXT | systemtest-linkback |
| `start_date` | DATE | admin.ts, container-detail, audit-log |
| `suggestion_comment` | TEXT | Cockpit-Feature-Suggest (migration sql) |
| `thesis_tag` | TEXT | audit-log, tickets.ts index |

### 5 Spalten — konstant (Default-Wert über alle Zeilen, nie abweichend)

| Spalte | Typ, Default | Code-Fundstellen |
|--------|-------------|------------------|
| `next_step` | BOOLEAN NOT NULL DEFAULT false | Cockpit-Feature-Suggest |
| `major_feature` | BOOLEAN NOT NULL DEFAULT false | Cockpit-Feature-Suggest |
| `retry_count` | INTEGER NOT NULL DEFAULT 0 | migrations.ts (Wird gesetzt, nie abweichend) |
| `pinned` | BOOLEAN NOT NULL DEFAULT false | migrations.ts |
| `time_logged_minutes` | INTEGER NOT NULL DEFAULT 0 | admin.ts, container-detail |

### 5 Spalten — unter 2 % belegt (ex-9, reduziert nach Prüfung)

| Spalte | Fillrate | Code-Fundstellen |
|--------|----------|------------------|
| `url` | 0,45 % (8/1787) | admin.ts, audit-log |
| `grilling_answers` | 0,28 % (5/1787) | systemtest-linkback, grilling |
| `grilling_meta` | 0,11 % (2/1787) | systemtest-linkback, grilling, triage-columns sql |
| `pipeline_slot` | 0,06 % (1/1787) | migrations.ts, v_active_features view |
| `requirements_list` | 1,12 % (20/1787) | container-detail, lastenheft |

**Hinweis:** Das Ticket nennt ~27 — laut Messung sind es 23 sichere Kandidaten
(13+5+5). `depends_on` (37/1787 = 2,07 %) liegt knapp über der 2-%-Schwelle und
wird auf alive belassen. Die `source_test_*`-Spalten sind als 5 individuelle
Spalten zu je 0 % gezählt. Die Differenz zu ~27 liegt in Rundung oder in Spalten,
deren Status nach Code-Review entschieden wird.

### Auf alive belassen (trotz niedriger Fillrate genutzt)

| Spalte | Fillrate | Begründung |
|--------|----------|------------|
| `scout_drift` | 11,02 % | Scout-Ratchet aktiv im Einsatz |
| `scout_drift_at` | 11,02 % | Scout-Ratchet aktiv im Einsatz |
| `depends_on` | 2,07 % | Planungsbüro-Dependency-Tracking |
| `effort` | 9,01 % | Planungsbüro |
| `readiness` | 8,90 % | Lastenheft-Lock + DoR-Score |
| `value_prop` | 7,67 % | Container-Detail |
| `touched_files` | 10,13 % | Factory-Conflict-Gate |
| `slot_count` | 100 % (6 Werte) | Factory-Parallel-Slots |
| `discarded` | 100 % (2 Werte) | Cockpit-Feature-Suggest, 1 Ticket aktiv |

## Tasks

### 1. Inventur verifizieren

- [ ] Run fill-rate query against mentolder DB (done — siehe Background)
- [ ] Run fill-rate query against korczewski DB (done — Abweichungen dokumentieren)
- [ ] Pro Kandidat entscheiden: remove or keep
- [ ] Finale Liste der zu entfernenden Spalten in delta spec dokumentieren

### 2. `scope`-Spalte entfernen

- [ ] `migrations.ts` Zeile 18: `scope TEXT` aus legacy ALTER TABLE entfernen
- [ ] Code-Referenzen auf `scope` suchen und entfernen
- [ ] `DROP COLUMN IF EXISTS scope` in Migration

### 3. Cockpit-Feature-Suggest-Spalten entfernen

Betrifft: `ai_question`, `human_answer`, `suggestion_comment`, `next_step`,
`major_feature`

- [ ] `scripts/migrations/2026-06-15-cockpit-feature-suggest.sql` — gesamte Datei
      als obsolet markieren (kein DROP mehr nötig, Migration läuft künftig
      `ADD COLUMN IF NOT EXISTS` die nie feuern)
- [ ] Code-Referenzen auf diese Spalten suchen und entfernen
- [ ] `DROP COLUMN IF EXISTS` für alle 5 in einer neuen Migration

### 4. Datums-/Schätz-Spalten entfernen

Betrifft: `start_date`, `due_date`, `estimate_minutes`, `time_logged_minutes`

- [ ] `admin.ts`: `startDate`, `dueDate`, `estimateMinutes`, `timeLoggedMinutes`
      aus SELECT- und Param-Listen entfernen
- [ ] `tickets.ts` (CREATE TABLE): Spalten aus DDL entfernen
- [ ] `container-detail.ts`: `estimateMinutes`-Referenz prüfen/entfernen
- [ ] Audit-Log (`fn_audit_log`): tracked_field-Array um `start_date`, `due_date`,
      `estimate_minutes` kürzen
- [ ] `DROP COLUMN IF EXISTS` für alle 4

### 5. `retry_count`-Spalte entfernen

- [ ] `migrations.ts` Zeile 35: ADD COLUMN retry_count entfernen
- [ ] `DROP COLUMN IF EXISTS retry_count`
- [ ] Code-Referenzen prüfen (Factory-Retry-Logik — ist nie angesprungen)

### 6. `pinned`-Spalte entfernen

- [ ] `migrations.ts` Zeile 67: ADD COLUMN pinned entfernen
- [ ] `DROP COLUMN IF EXISTS pinned`

### 7. `url`-Spalte entfernen

- [ ] `tickets.ts` (CREATE TABLE): `url TEXT` entfernen
- [ ] `admin.ts`: `t.url` aus SELECT und Param-Listen entfernen
- [ ] Audit-Log (`fn_audit_log`): tracked_field-Array um `url` kürzen
- [ ] `DROP COLUMN IF EXISTS url`

### 8. `thesis_tag`-Spalte entfernen

- [ ] `tickets.ts` (CREATE TABLE): `thesis_tag TEXT` entfernen
- [ ] `tickets.ts` (Index): `tickets_thesis_tag_idx` entfernen
- [ ] Audit-Log (`fn_audit_log`): tracked_field-Array um `thesis_tag` kürzen
- [ ] `DROP COLUMN IF EXISTS thesis_tag`

### 9. `source_test_*`-Spalten entfernen

Betrifft: `source_test_assignment_id`, `source_test_question_id`,
`source_test_run_id`, `source_test_result_id`, `source_test_id`

- [ ] `systemtest-linkback.ts`: ADD COLUMN-Block + unique indexes entfernen
- [ ] `systemtest/db.ts`: ALTER TABLE ADD COLUMN-Block für diese Spalten entfernen
- [ ] `failure-bridge.ts`, `failure-bridge.test.ts`, `reconciler.ts`,
      `reconciler.test.ts`, `cleanup.test.ts`, `retest-trigger.test.ts`,
      `board.test.ts`: alle Referenzen auf source_test_* entfernen
- [ ] `migrations.ts` `fn_purge_test_data()`: Has-column-Checks und
      source_test_assignment_id-Referenzen entfernen
- [ ] `DROP COLUMN IF EXISTS` für alle 5

### 10. `grilling_meta` / `grilling_answers`-Spalten entfernen

- [ ] `systemtest-linkback.ts`: ADD COLUMN grilling_* entfernen
- [ ] `scripts/migrations/2026-06-17-triage-columns.sql`: grilling_meta aus der
      Datei entfernen
- [ ] Code-Referenzen in grilling.ts-Kommentaren prüfen
- [ ] `DROP COLUMN IF EXISTS` für beide

### 11. `pipeline_slot`-Spalte entfernen

- [ ] `migrations.ts` Zeile 30: ADD COLUMN pipeline_slot entfernen
- [ ] `tickets.ts` (v_active_features view): `pipeline_slot` aus SELECT entfernen
- [ ] Code-Referenzen auf `pipeline_slot` suchen und entfernen
- [ ] `DROP COLUMN IF EXISTS pipeline_slot`

### 12. Neue DB-Migration erstellen

Eine neue Datei `scripts/migrations/2026-07-28-schema-diaet-T002331.sql`:

```sql
-- Schema-Diät T002331: ~23 tote Spalten entfernen.
-- Idempotent (IF EXISTS). Nach Ausführung auf BEIDEN Brand-DBs:
--   workspace            (mentolder)
--   workspace-korczewski (korczewski)
ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS ai_question;
ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS human_answer;
ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS due_date;
ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS estimate_minutes;
ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS scope;
ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS source_test_assignment_id;
ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS source_test_question_id;
ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS source_test_run_id;
ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS source_test_result_id;
ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS source_test_id;
ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS start_date;
ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS suggestion_comment;
ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS thesis_tag;
ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS next_step;
ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS major_feature;
ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS retry_count;
ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS pinned;
ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS time_logged_minutes;
ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS url;
ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS grilling_answers;
ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS grilling_meta;
ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS pipeline_slot;
ALTER TABLE tickets.tickets DROP COLUMN IF EXISTS requirements_list;
```

- [ ] Datei erstellen
- [ ] In `Taskfile.yml` oder Ausführungsanleitung verlinken

### 13. Schema-Code säubern

- [ ] `tickets/tables/tickets.ts` (CREATE TABLE):
      `url`, `thesis_tag`, `start_date`, `due_date`, `estimate_minutes`,
      `time_logged_minutes` aus Spaltenliste entfernen
- [ ] `tickets.ts` (Index): `tickets_thesis_tag_idx` entfernen
- [ ] `tickets.ts` (v_active_features): `pipeline_slot` aus SELECT entfernen
- [ ] `tickets.ts` (fn_audit_log tracked_field): `url`, `thesis_tag`,
      `start_date`, `due_date`, `estimate_minutes` entfernen
- [ ] `migrations.ts`:
      - Legacy-ADD: `scope` entfernen
      - `retry_count` ADD entfernen
      - `pinned` ADD entfernen
      - `pipeline_slot` ADD entfernen
- [ ] `systemtest-linkback.ts`: source_test_*-ADD + unique indexes + grilling_*-ADD entfernen
- [ ] `systemtest/db.ts`: source_test_*-ADD-Block entfernen

### 14. Tests anpassen

- [ ] Alle `CREATE TABLE tickets.tickets (...)` in Testdateien synchronisieren
      (die reduzierten Spalten aus den Test-Kreatur-Tabellen entfernen):
      - `appointments-db.test.ts`
      - `planning-office.test.ts`
      - `factory-floor.test.ts`
      - `cockpit-db.test.ts`
      - `container-detail.test.ts`
      - `admin.test.ts` (enthält Referenzen auf estimateMinutes etc.)
      - `website-db.test.ts`, `website-db-projects.test.ts`
      - `failure-bridge.test.ts`, `reconciler.test.ts`,
        `retest-trigger.test.ts`, `cleanup.test.ts`, `board.test.ts`,
        `db.test.ts`
- [ ] Alle Test-Mocks/Fixtures aufräumen, die tote Spalten setzen
- [ ] `task test:changed` laufen lassen

### 15. CI-Gates

```bash
task test:changed
task freshness:regenerate
task freshness:check
bash scripts/preflight-pr-scope.sh
```

## Files (erwartete Änderungen)

```
CHANGED:
  website/src/lib/tickets/tables/tickets.ts           — CREATE TABLE + Index + View + Audit-Log
  website/src/lib/tickets/tables/systemtest-linkback.ts — ADD COLUMN + Index-Block entfernen
  website/src/lib/tickets/migrations.ts                 — legacy ADD COLUMN + purge_test_data
  website/src/lib/systemtest/db.ts                      — source_test_*-ADD entfernen
  website/src/lib/systemtest/failure-bridge.ts          — source_test_*-Refs
  website/src/lib/systemtest/reconciler.ts              — source_test_*-Ref
  website/src/lib/tickets/lastenheft.ts                 — requirements_list nutzt README?
  website/src/lib/tickets/container-detail.ts           — estimateMinutes etc.
  website/src/lib/tickets/admin.ts                      — url, startDate, dueDate, etc.
  website/src/lib/tickets/cockpit-db.ts                 — planning_rank nur (alive)
  website/src/lib/tickets/transition.ts                 — ggf. updateSuccessorReadiness

REMOVED (aus Tests):
  - Referenzen auf estimate_minutes, start_date, due_date in allen Test-Dateien

ADDED:
  scripts/migrations/2026-07-28-schema-diaet-T002331.sql  — DROP COLUMN Migration

REDUNDANT (obsolet, kein aktiver Code mehr):
  scripts/migrations/2026-06-15-cockpit-feature-suggest.sql — entire file (Markierung)
  scripts/migrations/2026-06-17-triage-columns.sql          — grilling_meta-Zeile entfernen
```

## Risiken und Gegenmaßnahmen

| Risiko | Maßnahme |
|--------|----------|
| S1-CI-Ratchet schlägt an (20+ Dateien, viele baselined) | Netto-Zeilenbilanz ist negativ (Rückbau). Vor PR `task freshness:check` |
| Vergessene Referenz auf tote Spalte → Runtime-Fehler | Volltextsuche nach jedem Spaltennamen (`grep -rn '"scope"'`) |
| DB-Migration auf beiden Brands vergessen | Explizit in deployment instructions dokumentieren |
| Konflikt mit parallel developed Feature | Kurzes Zeitfenster — D ist letzter Teil des Epics; bei Konflikt → rebase |

## Deployment

```bash
# Nach Merge auf main, beide Brands:
kubectl exec -it deploy/shared-db -n workspace          --context fleet -c postgres -- psql -U website -d website -f - < scripts/migrations/2026-07-28-schema-diaet-T002331.sql
kubectl exec -it deploy/shared-db -n workspace-korczewski --context fleet -c postgres -- psql -U website -d website -f - < scripts/migrations/2026-07-28-schema-diaet-T002331.sql
```
