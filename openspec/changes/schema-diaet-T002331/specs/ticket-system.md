## ADDED Requirements

### Requirement: Schema-Diät entfernt bestätigt tote Spalten aus tickets.tickets

Das System SHALL nur Spalten in `tickets.tickets` führen, die nachweislich einen
Schreiber oder Leser im Code haben. `ai_question`, `human_answer` und `scope`
SHALL aus `tickets.tickets` entfernt werden (Migration
`scripts/migrations/2026-07-28-schema-diaet-T002331.sql`, `DROP COLUMN IF
EXISTS`, idempotent, auf beiden Brand-DBs `workspace` und
`workspace-korczewski` anzuwenden), weil sie nach Code-Referenzstellen-Analyse
keinen Schreiber/Leser haben: `ai_question`/`human_answer` sind nur in der
generischen Ticket-PATCH-Whitelist (`admin.ts`,
`pages/api/admin/tickets/[id].ts`) erwähnt, aber nie von einer UI/einem
Skript gesendet worden (0/1787 mentolder, 0/11 korczewski); `scope` auf
`tickets.tickets` (nicht zu verwechseln mit `tickets.pr_events.scope`, einer
anderen, aktiv befüllten Tabelle) hatte außer der `ADD COLUMN IF NOT
EXISTS`-Zeile in `migrations.ts` keine einzige Referenz im Repo.

Von den ursprünglich im Epic T002326 als ~23 tot vermuteten Kandidaten-Spalten
SHALL nur diese drei tatsächlich entfernt werden. Die Zweit-Prüfung der
Fillrate gegen die korczewski-Brand-DB (Ticket-Pflicht) sowie eine
Code-Referenzstellen-Analyse ergaben, dass die übrigen ~20 Kandidaten an
lebende, aktiv verdrahtete Funktionen gekoppelt sind (UI-Feld, API mit echtem
Aufrufer, CLI-Skript, MCP-Tool oder Trigger/Index-Kopplung mit einer
belegten Spalte) — eine Fillrate von 0 % bedeutete in diesen Fällen "noch nie
ausgelöst", nicht "tot". Details je Spalte stehen in der Tabelle unten.

#### Scenario: Migration droppt genau drei Spalten, nicht mehr

- **GIVEN** die Migration `scripts/migrations/2026-07-28-schema-diaet-T002331.sql`
- **WHEN** sie gegen eine Brand-DB ausgeführt wird
- **THEN** verschwinden `ai_question`, `human_answer` und `scope` aus
  `tickets.tickets`, während `tickets.pr_events.scope` unverändert bleibt und
  jede andere ursprünglich vermutete Kandidaten-Spalte (`due_date`,
  `start_date`, `source_test_*`, `retry_count`, `pinned`, `url`, `thesis_tag`,
  `estimate_minutes`, `time_logged_minutes`, `next_step`, `major_feature`,
  `suggestion_comment`, `grilling_answers`, `grilling_meta`, `pipeline_slot`,
  `requirements_list`) erhalten bleibt

#### Scenario: Website-Code referenziert die entfernten Spalten nirgends mehr

- **GIVEN** der Website-Code in `website/src/lib/tickets/` und
  `website/src/pages/api/admin/tickets/`
- **WHEN** nach `ai_question`, `human_answer` oder der
  `tickets.tickets`-Spalte `scope` gesucht wird
- **THEN** liefert die Suche keinen Treffer mehr außerhalb der als obsolet
  markierten Alt-Migration `2026-05-19-ai-question-human-answer.sql`, während
  eine bewusst alive belassene Spalte wie `grilling_answers` weiterhin
  referenziert ist (Positiv-Anker, siehe
  `tests/spec/ticket-system/schema-diaet-dead-columns.bats`)

---

### Bewusst auf alive belassen (mit Begründung)

Von den ursprünglich als Kandidaten gelisteten Spalten bleiben folgende
erhalten, weil sie an lebende Funktionen gekoppelt sind:

| Spalte | Neuer Befund | Grund für „alive" |
|--------|--------------|--------------------|
| `due_date` | korczewski 1/11 befüllt (mentolder 0/1787) | Brand-Abweichung — genau der Fall, vor dem die Zweit-Prüfung schützen sollte. |
| `start_date` | korczewski 1/11 befüllt | Dito. |
| `source_test_question_id` | korczewski 3/11 befüllt; 0/1787 mentolder | Brand-Abweichung + im selben Unique-Index/Trigger wie `source_test_assignment_id` gekoppelt (`systemtest-linkback.ts`, `systemtest/db.ts trg_systemtest_retest`). |
| `source_test_assignment_id` | 0 % in beiden Brands | Im selben `INSERT`/Trigger wie das alive `source_test_question_id` gekoppelt (`failure-bridge.ts`); Entfernen würde das INSERT und `trg_systemtest_retest` brechen. |
| `source_test_run_id`, `source_test_result_id`, `source_test_id` | 0 % in beiden Brands | Aktiv verdrahtete Test-Run-Failure-Bridge (`test-run-bridge.ts`, aufgerufen von `ingest-e2e.ts`/`test-runner.ts`) mit eigenem `INSERT`+Unique-Index+FK — nie ausgelöst, aber ein lebender Code-Pfad. Entfernen wäre Verhaltensänderung an einer verdrahteten (nur unbenutzten) Pipeline, nicht Schema-Rückbau. |
| `retry_count` | Konstant 0 in beiden Brands | Schreiber `scripts/ticket.sh retry-count` (bump/reset), Leser `factory-floor.ts` (Anzeige „retry erschöpft"). Live Sicherheitsmechanismus, nur nie ausgelöst. |
| `pinned` | Konstant false | Schreiber `pages/api/planning-office/[extId].ts`, aktiv in `ORDER BY pinned DESC` (Planungsbüro-Queue-Sortierung). |
| `time_logged_minutes` | Konstant 0 | Teil des generischen Ticket-PATCH (`admin.ts`); bewusst konservativ belassen im Verbund mit den ebenfalls alive Zeit-/Datumsfeldern. |
| `url` | 0,45 % (mentolder), 0/11 (korczewski) | Teil des generischen Ticket-PATCH + Audit-Log `tracked_field`-Array (`tickets.ts` `fn_audit_log`). Aktiv überwacht, kein verwaister Ballast. |
| `thesis_tag` | 0 % (beide Brands) | Audit-Log `tracked_field` + eigenes Anzeige-Feld im Ticket-Detail-UI (`pages/admin/tickets/[id].astro`). |
| `estimate_minutes` | 0 % (beide Brands) | Audit-Log `tracked_field`; Teil desselben generischen PATCH wie `due_date`/`start_date`, die nachweislich brand-abweichend befüllt sind. |
| `next_step`, `major_feature`, `suggestion_comment` | Konstant/0 % | Teil der Cockpit-Feature-Suggest-Action-Buttons (`VALID_ACTIONS = next_step/discard/major/comment` in `feature-actions.ts`). `discard` (→ `discarded`-Spalte) ist mit 100 % aktiv genutzt — 3 von 4 Buttons der gleichen UI zu entfernen wäre eine sichtbare Verhaltensänderung, nicht Rückbau. |
| `grilling_answers`, `grilling_meta` | 0,28 %/0,11 % (mentolder), 0/11 (korczewski) | Schreiber `scripts/lib/ticket-grill.sh` + `ticket-mcp record_grill_answers` (Grilling-to-Ticket-Workflow, DoR-Prozess), Leser `final-grilling.ts`; `grilling_meta` zusätzlich per `UPDATE … SET grilling_meta = grilling_meta - 'triage'` in `planning-office.ts` genutzt. |
| `pipeline_slot` | 0,06 % (mentolder), 0/11 (korczewski) | Aktiv gelesen/geschrieben in `factory-floor.ts`, `qa-dal.ts`, `qa-ingest.ts` (Factory-Slot-Freigabe bei Ticket-Abschluss) sowie im UI (`FactoryKpiGrid.svelte`). |
| `requirements_list` | 1,12 % (mentolder), 0/11 (korczewski) | Lastenheft-Lock-Feature (`planning-office.ts`, `container-detail.ts`, `lastenheft.ts`), aktiv im UI angezeigt (`PlanningOfficeDetail.svelte`, `ContainerDorPanel.svelte`, `TicketSpecProgress.svelte`). |

Weiterhin unverändert alive (bereits im ursprünglichen Design so entschieden):
`depends_on` (2,07 %, Planungsbüro-Abhängigkeitstracking), `scout_drift` /
`scout_drift_at` (11,02 %, Scout-Ratchet aktiv), `effort` (9,01 %,
Planungsbüro), `readiness` (8,90 %, Lastenheft-Lock), `value_prop` (7,67 %,
Container-Detail), `touched_files` (10,13 %, Factory-Conflict-Gate),
`slot_count` (100 %, Factory-Parallel-Slots), `discarded` (100 %,
Feature-Suggest), `notes` (40,35 %, Admin-Kommentare), `areas` (35,14 %,
Planungsbüro), `planning_rank` (via cockpit-db, Planungsbüro).
