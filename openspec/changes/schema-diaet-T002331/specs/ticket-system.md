# ticket-system — Schema-Diät (Delta)

Dieses Delta ändert die SSOT `openspec/specs/ticket-system.md`, indem es die
Existenz von 3 toten Spalten aus der `tickets.tickets`-Tabelle entfernt.

**Umfang gegenüber dem ursprünglichen Design REDUZIERT.** Das ursprüngliche
Design (siehe `../tasks.md` Background) ging von ~23 toten Kandidaten aus,
basierend auf einer Fillrate-Analyse **nur gegen die mentolder-DB**. Die für
dieses Ticket vorgeschriebene Zweit-Prüfung gegen die korczewski-DB **plus**
eine Code-Referenzstellen-Analyse (wer schreibt/liest die Spalte tatsächlich)
ergab: fast jede Kandidaten-Spalte ist an eine lebende, aktiv verdrahtete
Funktion gekoppelt (UI-Feld, API mit echtem Aufrufer, CLI-Skript, MCP-Tool,
oder ein Trigger/Index, der dieselbe Spalte wie eine belegte Spalte nutzt) —
auch wenn der Fill-Rate-Wert 0 % beträgt, weil das Feature schlicht noch nie
ausgelöst wurde. „0 % befüllt" war also nicht gleichbedeutend mit „tot".

## Änderungen

### 1. Entfernte Spalten (3, statt ursprünglich ~23)

| Spalte | Grund |
|--------|-------|
| `ai_question` | 0/1787 (mentolder), 0/11 (korczewski). Einzige Referenz: die inerte generische PATCH-Feld-Whitelist in `admin.ts`/`pages/api/admin/tickets/[id].ts` — von keiner UI/Skript/Automation je gesendet. Kein anderer Leser/Schreiber im Repo. |
| `human_answer` | Wie `ai_question` — gleiche Whitelist, gleiche Migration (`2026-05-19-ai-question-human-answer.sql`), kein Aufrufer. |
| `scope` (auf `tickets.tickets`) | Nur die `ADD COLUMN IF NOT EXISTS`-Zeile in `migrations.ts`; keine SELECT/UPDATE/Referenz irgendwo im Code. **Nicht** zu verwechseln mit `tickets.pr_events.scope` (andere Tabelle, aktiv befüllt über PR-Kategorisierung — bleibt unangetastet). |

### 2. Ursprünglich als Kandidat gelistet, jetzt bewusst auf alive belassen

| Spalte | Neuer Befund | Grund für „alive" |
|--------|--------------|--------------------|
| `due_date` | korczewski 1/11 befüllt (mentolder 0/1787) | Brand-Abweichung — genau der Fall, vor dem die Zweit-Prüfung schützen sollte. |
| `start_date` | korczewski 1/11 befüllt | Dito. |
| `source_test_question_id` | korczewski 3/11 befüllt; 0/1787 mentolder | Brand-Abweichung + im selben Unique-Index/Trigger wie `source_test_assignment_id` gekoppelt (`systemtest-linkback.ts`, `systemtest/db.ts trg_systemtest_retest`). |
| `source_test_assignment_id` | 0 % in beiden Brands | Im selben `INSERT`/Trigger wie das alive `source_test_question_id` gekoppelt (`failure-bridge.ts`); Entfernen würde das INSERT und `trg_systemtest_retest` brechen. |
| `source_test_run_id`, `source_test_result_id`, `source_test_id` | 0 % in beiden Brands | Aktiv verdrahtete Test-Run-Failure-Bridge (`test-run-bridge.ts`, aufgerufen von `ingest-e2e.ts`/`test-runner.ts`) mit eigenem `INSERT`+Unique-Index+FK — nie ausgelöst, aber ein lebender Code-Pfad. Entfernen wäre Verhaltensänderung an einer verdrahteten (nur unbenutzten) Pipeline, nicht Schema-Rückbau. |
| `retry_count` | Konstant 0 in beiden Brands | Schreiber `scripts/ticket.sh retry-count` (bump/reset), Leser `factory-floor.ts` (Anzeige „retry erschöpft"). Live Sicherheitsmechanismus, nur nie ausgelöst. |
| `pinned` | Konstant false | Schreiber `pages/api/planning-office/[extId].ts`, aktiv in `ORDER BY pinned DESC` (Planungsbüro-Queue-Sortierung). |
| `time_logged_minutes` | Konstant 0 | Teil des generischen Ticket-PATCH (`admin.ts`); Audit-Log trackt nicht, aber kein toter Reiner-Whitelist-Fall wie `ai_question` — bewusst konservativ belassen (siehe Anmerkung unten). |
| `url` | 0,45 % (mentolder), 0/11 (korczewski) | Teil des generischen Ticket-PATCH + Audit-Log `tracked_field`-Array (`tickets.ts` `fn_audit_log`). Aktiv überwacht, kein verwaister Ballast. |
| `thesis_tag` | 0 % (beide Brands) | Audit-Log `tracked_field` + eigenes Anzeige-Feld im Ticket-Detail-UI (`pages/admin/tickets/[id].astro`). |
| `estimate_minutes` | 0 % (beide Brands) | Audit-Log `tracked_field`; Teil desselben generischen PATCH wie `due_date`/`start_date`, die nachweislich brand-abweichend befüllt sind. |
| `next_step`, `major_feature`, `suggestion_comment` | Konstant/0 % | Teil der Cockpit-Feature-Suggest-Action-Buttons (`VALID_ACTIONS = next_step/discard/major/comment` in `feature-actions.ts`). `discard` (→ `discarded`-Spalte) ist mit 100 % aktiv genutzt — 3 von 4 Buttons der gleichen UI zu entfernen wäre eine sichtbare Verhaltensänderung, nicht Rückbau. |
| `grilling_answers`, `grilling_meta` | 0,28 %/0,11 % (mentolder), 0/11 (korczewski) | Schreiber `scripts/lib/ticket-grill.sh` + `ticket-mcp record_grill_answers` (Grilling-to-Ticket-Workflow, DoR-Prozess), Leser `final-grilling.ts`; `grilling_meta` zusätzlich per `UPDATE … SET grilling_meta = grilling_meta - 'triage'` in `planning-office.ts` genutzt. |
| `pipeline_slot` | 0,06 % (mentolder), 0/11 (korczewski) | Aktiv gelesen/geschrieben in `factory-floor.ts`, `qa-dal.ts`, `qa-ingest.ts` (Factory-Slot-Freigabe bei Ticket-Abschluss) sowie im UI (`FactoryKpiGrid.svelte`). |
| `requirements_list` | 1,12 % (mentolder), 0/11 (korczewski) | Lastenheft-Lock-Feature (`planning-office.ts`, `container-detail.ts`, `lastenheft.ts`), aktiv im UI angezeigt (`PlanningOfficeDetail.svelte`, `ContainerDorPanel.svelte`, `TicketSpecProgress.svelte`). |

### 3. Weiterhin auf alive belassen (unverändert gegenüber ursprünglichem Design)

| Spalte | Fillrate | Begründung |
|--------|----------|------------|
| `depends_on` | 2,07 % | Planungsbüro-Abhängigkeitstracking |
| `scout_drift` | 11,02 % | Scout-Ratchet aktiv |
| `scout_drift_at` | 11,02 % | Scout-Ratchet aktiv |
| `effort` | 9,01 % | Planungsbüro |
| `readiness` | 8,90 % | Lastenheft-Lock |
| `value_prop` | 7,67 % | Container-Detail |
| `touched_files` | 10,13 % | Factory-Conflict-Gate |
| `slot_count` | 100 % | Factory-Parallel-Slots |
| `discarded` | 100 % | Feature-Suggest mit 1 aktivem Ticket |
| `notes` | 40,35 % | Admin-Kommentare |
| `areas` | 35,14 % | Planungsbüro |
| `planning_rank` | via cockpit-db | Planungsbüro |

### 4. Kein neues Verhalten

Dieses Delta fügt kein neues Requirement hinzu. Es entfernt genau die zwei
Cockpit-Feature-Suggest-Freitextfelder und die verwaiste `scope`-Spalte, die
nachweislich ohne jeden Schreiber/Leser im Repo sind. Alle API-Exports und
Verträge bleiben unverändert — nur die Datenbank-DDL ändert sich.
