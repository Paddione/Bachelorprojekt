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

## UMFANG REDUZIERT (Implement-Phase, 2026-07-28)

**Von ~23 ursprünglich geplanten Spalten werden nur 3 tatsächlich entfernt:
`ai_question`, `human_answer`, `scope`.** Grund: die Zweit-Prüfung gegen die
korczewski-DB (Task 1) plus eine Code-Referenzstellen-Analyse ergab, dass
fast jede Kandidaten-Spalte an eine lebende, aktiv verdrahtete Funktion
gekoppelt ist (UI-Feld, API mit echtem Aufrufer, CLI-Skript, MCP-Tool, oder
Trigger/Index-Kopplung mit einer belegten Spalte) — 0 % Fillrate bedeutete
in diesen Fällen „noch nie ausgelöst", nicht „tot". Volle Begründung je
Spalte: `specs/ticket-system.md` Abschnitt 2. Die Tasks 4–11 unten sind
entsprechend als „entfällt" markiert, wo die jeweilige Spalte jetzt alive
bleibt; nur Task 2 (scope) und Task 3, reduziert auf ai_question/human_answer,
wurden tatsächlich ausgeführt.

### 1. Inventur verifizieren

- [x] Run fill-rate query against mentolder DB (done — siehe Background)
- [x] Run fill-rate query against korczewski DB — **Abweichungen gefunden**:
      `due_date` (1/11), `start_date` (1/11), `source_test_question_id` (3/11)
      sind in korczewski befüllt, obwohl 0 % in mentolder → bleiben alive.
- [x] Pro Kandidat entscheiden: remove or keep — siehe `specs/ticket-system.md`
- [x] Finale Liste der zu entfernenden Spalten in delta spec dokumentiert
      (3 statt ~23: `ai_question`, `human_answer`, `scope`)

### 2. `scope`-Spalte entfernen

- [x] `migrations.ts` Zeile 18: `scope TEXT` aus legacy ALTER TABLE entfernen
- [x] Code-Referenzen auf `scope` suchen und entfernen (keine gefunden außer
      der ADD-COLUMN-Zeile selbst; `tickets.pr_events.scope` ist eine andere
      Tabelle und bleibt unangetastet)
- [x] `DROP COLUMN IF EXISTS scope` in Migration

### 3. Cockpit-Feature-Suggest-Spalten — REDUZIERT auf `ai_question`/`human_answer`

Ursprünglich geplant: `ai_question`, `human_answer`, `suggestion_comment`,
`next_step`, `major_feature`. Nach Code-Analyse: `suggestion_comment`,
`next_step`, `major_feature` sind Teil der Cockpit-Feature-Suggest-
Action-Buttons (`VALID_ACTIONS` in `feature-actions.ts`, geschrieben über
`cockpit-db.ts`); `discard` (→ `discarded`) aus derselben Action-Liste ist
aktiv genutzt (100 % belegt). 3 von 4 Buttons einer lebenden UI zu entfernen
wäre eine Verhaltensänderung, kein Rückbau → bleiben alive.

- [x] `scripts/migrations/2026-05-19-ai-question-human-answer.sql` — als
      obsolet markiert (Kommentar-Header, Datei bleibt als No-Op-Historie)
- [x] Code-Referenzen auf `ai_question`/`human_answer` entfernt (`admin.ts`
      SELECT + PATCH-Whitelist, `pages/api/admin/tickets/[id].ts`-Whitelist,
      `admin.test.ts`-Fixtures)
- [x] `DROP COLUMN IF EXISTS` für `ai_question`/`human_answer` in neuer Migration
- [ ] ~~`suggestion_comment`, `next_step`, `major_feature` entfernen~~ —
      **entfällt**, siehe Begründung oben und `specs/ticket-system.md`.

### 4. Datums-/Schätz-Spalten — **entfällt vollständig**

Ursprünglich geplant: `start_date`, `due_date`, `estimate_minutes`,
`time_logged_minutes`. Die korczewski-Fillrate-Prüfung (Task 1) zeigte
`due_date`/`start_date` mit je 1/11 befüllten Zeilen — brand-abweichend
befüllt, also nicht tot. `estimate_minutes`/`time_logged_minutes` sind
weiterhin 0 % in beiden Brands, aber Teil desselben generischen Ticket-PATCH
und (für `due_date`/`estimate_minutes`) desselben Audit-Log
`tracked_field`-Arrays wie die jetzt bestätigt alive Spalten — aus
Konsistenzgründen bewusst konservativ komplett belassen statt zwei von vier
eng verwandten Feldern halbherzig zu entfernen.

- [ ] ~~Alle Unterpunkte~~ — **entfällt**

### 5. `retry_count`-Spalte — **entfällt**

Schreiber `scripts/ticket.sh retry-count` (bump/reset), Leser
`factory-floor.ts` (Anzeige „retry erschöpft"). Live Sicherheitsmechanismus,
nur nie ausgelöst — kein Rückbau-Kandidat.

- [ ] ~~Alle Unterpunkte~~ — **entfällt**

### 6. `pinned`-Spalte — **entfällt**

Schreiber `pages/api/planning-office/[extId].ts`, aktiv in
`ORDER BY pinned DESC` (Planungsbüro-Queue-Sortierung).

- [ ] ~~Alle Unterpunkte~~ — **entfällt**

### 7. `url`-Spalte — **entfällt**

Teil des generischen Ticket-PATCH + Audit-Log `tracked_field`-Array.

- [ ] ~~Alle Unterpunkte~~ — **entfällt**

### 8. `thesis_tag`-Spalte — **entfällt**

Audit-Log `tracked_field` + eigenes Anzeige-Feld im Ticket-Detail-UI
(`pages/admin/tickets/[id].astro`).

- [ ] ~~Alle Unterpunkte~~ — **entfällt**

### 9. `source_test_*`-Spalten — **entfällt vollständig**

Ursprünglich geplant: alle 5. `source_test_question_id` ist in korczewski
3/11 befüllt (brand-abweichend) und im selben Unique-Index/Trigger wie
`source_test_assignment_id` gekoppelt. Die übrigen 3
(`source_test_run_id`/`result_id`/`id`) sind 0 % in beiden Brands, aber Teil
einer aktiv verdrahteten, nur noch nie ausgelösten Test-Run-Failure-Bridge
(`test-run-bridge.ts`, aufgerufen von `ingest-e2e.ts`/`test-runner.ts`) mit
eigenem INSERT/Unique-Index/FK. Entfernen wäre Verhaltensänderung an einer
lebenden Pipeline.

- [ ] ~~Alle Unterpunkte~~ — **entfällt**

### 10. `grilling_meta` / `grilling_answers`-Spalten — **entfällt**

Schreiber `scripts/lib/ticket-grill.sh` + `ticket-mcp record_grill_answers`
(Grilling-to-Ticket-DoR-Workflow), Leser `final-grilling.ts`; `grilling_meta`
zusätzlich per `UPDATE … SET grilling_meta = grilling_meta - 'triage'` in
`planning-office.ts` genutzt. Live, nur selten ausgelöst.

- [ ] ~~Alle Unterpunkte~~ — **entfällt**

### 11. `pipeline_slot`-Spalte — **entfällt**

Aktiv gelesen/geschrieben in `factory-floor.ts`, `qa-dal.ts`, `qa-ingest.ts`
(Factory-Slot-Freigabe bei Ticket-Abschluss) sowie im UI
(`FactoryKpiGrid.svelte`).

- [ ] ~~Alle Unterpunkte~~ — **entfällt**

### 11b. `requirements_list`-Spalte — **entfällt**

Lastenheft-Lock-Feature (`planning-office.ts`, `container-detail.ts`,
`lastenheft.ts`), aktiv im UI angezeigt (`PlanningOfficeDetail.svelte`,
`ContainerDorPanel.svelte`, `TicketSpecProgress.svelte`).

- [ ] ~~Alle Unterpunkte~~ — **entfällt**

### 12. Neue DB-Migration erstellen

`scripts/migrations/2026-07-28-schema-diaet-T002331.sql` — enthält nur noch
3 `DROP COLUMN IF EXISTS` (`ai_question`, `human_answer`, `scope`) plus einen
ausführlichen Kommentar-Block, der die Umfangsreduktion und die Begründung
je ursprünglich geplanter Spalte dokumentiert (siehe Datei selbst und
`specs/ticket-system.md`).

- [x] Datei erstellt
- [x] Ausführungsanleitung im Deployment-Abschnitt unten (unverändert:
      manueller `kubectl exec … psql` auf beide Brand-DBs nach Merge)

### 13. Schema-Code säubern

- [x] `admin.ts`: `aiQuestion`/`humanAnswer` aus Type, SELECT, PATCH-Whitelist
      entfernen
- [x] `pages/api/admin/tickets/[id].ts`: `aiQuestion`/`humanAnswer` aus
      Whitelist entfernen
- [x] `migrations.ts`: Legacy-ADD `scope` entfernen
- [ ] ~~`url`, `thesis_tag`, `start_date`, `due_date`, `estimate_minutes`,
      `time_logged_minutes`, `retry_count`, `pinned`, `pipeline_slot`,
      `source_test_*`, `grilling_*` aus DDL/Views/Audit-Log entfernen~~ —
      **entfällt**, alle bleiben alive (siehe oben)

### 14. Tests anpassen

- [x] `admin.test.ts`: `aiQuestion`/`humanAnswer`-Referenzen aus Fixture und
      Testfall entfernt
- [ ] ~~Alle anderen gelisteten Testdateien~~ — **entfällt**, betrifft nur
      Spalten, die jetzt alive bleiben
- [x] `task test:changed` laufen lassen

### 15. CI-Gates

```bash
task test:changed
task freshness:regenerate
task freshness:check
bash scripts/preflight-pr-scope.sh
```

## Files (tatsächliche Änderungen — reduzierter Umfang)

```
CHANGED:
  website/src/lib/tickets/admin.ts                        — aiQuestion/humanAnswer aus Type,
                                                              SELECT, PATCH-Whitelist entfernt
  website/src/lib/tickets/admin.test.ts                    — Fixture + Testfall bereinigt
  website/src/pages/api/admin/tickets/[id].ts              — aiQuestion/humanAnswer aus
                                                              Whitelist entfernt
  website/src/lib/tickets/migrations.ts                    — legacy ADD COLUMN scope entfernt

ADDED:
  scripts/migrations/2026-07-28-schema-diaet-T002331.sql  — DROP COLUMN Migration
                                                              (ai_question, human_answer, scope)

MARKIERT ALS OBSOLET (Datei bleibt als No-Op-Historie erhalten):
  scripts/migrations/2026-05-19-ai-question-human-answer.sql

NICHT ANGEFASST (ursprünglich geplant, nach Analyse alive — siehe
specs/ticket-system.md für Begründung je Spalte):
  website/src/lib/tickets/tables/tickets.ts
  website/src/lib/tickets/tables/systemtest-linkback.ts
  website/src/lib/systemtest/db.ts, failure-bridge.ts, reconciler.ts, test-run-bridge.ts
  website/src/lib/tickets/lastenheft.ts, container-detail.ts, cockpit-db.ts
  scripts/migrations/2026-06-15-cockpit-feature-suggest.sql
  scripts/migrations/2026-06-17-triage-columns.sql
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
