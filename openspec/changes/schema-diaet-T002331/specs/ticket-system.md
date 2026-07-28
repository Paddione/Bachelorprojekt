# ticket-system — Schema-Diät (Delta)

Dieses Delta ändert die SSOT `openspec/specs/ticket-system.md`, indem es die
Existenz von 23 toten Spalten aus der `tickets.tickets`-Tabelle entfernt.

## Änderungen

### 1. Entfernte Spalten

Die folgenden Spalten werden aus `tickets.tickets` entfernt:

| Spalte | Grund |
|--------|-------|
| `ai_question` | 0 % belegt — Cockpit-Feature-Suggest nie aktiviert |
| `human_answer` | 0 % belegt — Cockpit-Feature-Suggest nie aktiviert |
| `due_date` | 0 % belegt — Zeitplanung nie eingeführt |
| `estimate_minutes` | 0 % belegt — Zeitschätzung nie eingeführt |
| `scope` | 0 % belegt — Bug/Kategorie-Differenzierung nie aktiviert |
| `source_test_assignment_id` | 0 % belegt — Systemtest-Linkback nie aktiviert |
| `source_test_question_id` | 0 % belegt — Systemtest-Linkback nie aktiviert |
| `source_test_run_id` | 0 % belegt — Systemtest-Linkback nie aktiviert |
| `source_test_result_id` | 0 % belegt — Systemtest-Linkback nie aktiviert |
| `source_test_id` | 0 % belegt — Systemtest-Linkback nie aktiviert |
| `start_date` | 0 % belegt — Zeitplanung nie eingeführt |
| `suggestion_comment` | 0 % belegt — Cockpit-Feature-Suggest nie aktiviert |
| `thesis_tag` | 0 % belegt — Themenzuordnung nie aktiviert |
| `next_step` | Konstant false — Cockpit-Feature-Suggest nie aktiviert |
| `major_feature` | Konstant false — Cockpit-Feature-Suggest nie aktiviert |
| `retry_count` | Konstant 0 — Factory-Retry nie aktiviert |
| `pinned` | Konstant false — Pin-Funktion nie aktiviert |
| `time_logged_minutes` | Konstant 0 — Zeiterfassung nie eingeführt |
| `url` | 0,45 % belegt — nicht aktiv genutzt |
| `grilling_answers` | 0,28 % — Grilling nie aktiv im Einsatz |
| `grilling_meta` | 0,11 % — Grilling nie aktiv im Einsatz |
| `pipeline_slot` | 0,06 % — Factory-Slot-Tracking nie aktiviert |
| `requirements_list` | 1,12 % — Lastenheft nie flächendeckend aktiviert |

### 2. Spalten auf alive belassen

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

### 3. Kein neues Verhalten

Dieses Delta fügt kein neues Requirement hinzu. Es entfernt Schema-Ballast,
der nie oder kaum produktiv genutzt wurde. Alle API-Exports und Verträge
bleiben unverändert — nur die Datenbank-DDL ändert sich.
