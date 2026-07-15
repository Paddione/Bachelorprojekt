## MODIFIED Requirements

### Requirement: Watchdog-Eskalation und Zombie-Cleanup

The system SHALL pro Tick stale `in_progress`-Tickets (kein `updated_at`-Update seit
`FACTORY_STALE_MIN` Minuten, Default 30) prüfen, ob bereits ein `FACTORY-PLAN-REF`-Kommentar
(`plan_ref` via `ticket.sh get`) existiert, und den Slot in jedem Fall freigeben sowie den
verwaisten Worktree entfernen:

- Existiert **kein** `plan_ref` (noch nie geplant), setzt das System den Status auf `triage`
  zurück (unverändertes Verhalten).
- Existiert bereits ein `plan_ref` und `type='feature'`, setzt das System den Status auf
  `backlog` zurück, statt die bereits geleistete Planungsarbeit über `triage` zu verwerfen —
  das Ticket re-qualifiziert sich direkt für `queue.sh`s Dispatch-Gate (bleibt
  `lastenheft_locked`) und `pipeline.js` erkennt `FACTORY-PLAN-REF` beim nächsten Dispatch
  automatisch, überspringt Scout/Design/Plan und setzt bei Implement fort.
- Existiert bereits ein `plan_ref` und `type='task'`, setzt das System den Status auf
  `plan_staged` zurück (matcht `queue.sh`s bestehenden Task-Dispatch-Pfad).

`awaiting_deploy`-Features ohne Deployment seit `FACTORY_AD_STALE_H` Stunden (Default 24)
werden mit `attention_mode=needs_human` markiert und erhalten einen Warn-Kommentar
(unverändert).

#### Scenario: Hung Pipeline ohne gestagten Plan (kein Phase-Heartbeat)
- **GIVEN** Ticket T000503 ist seit 35 Minuten `in_progress` ohne `ticket.sh touch`-Update
  und ohne `FACTORY-PLAN-REF`-Kommentar
- **WHEN** `watchdog.sh` ausgeführt wird (FACTORY_STALE_MIN=30)
- **THEN** T000503 erhält `status=triage`; `pipeline_slot=NULL`; ein Kommentar wird hinzugefügt; der Worktree `/tmp/wt-sf-t000503` wird entfernt

#### Scenario: Hung Pipeline MIT bereits gestagtem Plan (Feature)
- **GIVEN** Ticket T001828 (`type=feature`) ist seit 50 Minuten `in_progress` ohne
  `ticket.sh touch`-Update, trägt aber einen `FACTORY-PLAN-REF`-Kommentar von einem
  abgeschlossenen `dev-flow-plan`-Lauf
- **WHEN** `watchdog.sh` ausgeführt wird (FACTORY_STALE_MIN=30)
- **THEN** T001828 erhält `status=backlog` (nicht `triage`); `pipeline_slot=NULL`; ein
  Kommentar verweist auf den bereits vorhandenen Plan; der nächste Dispatcher-Tick claimed
  erneut einen Slot und `pipeline.js` fährt bei Implement fort, statt Scout/Design/Plan zu
  wiederholen

#### Scenario: Stale awaiting_deploy
- **GIVEN** Ticket T000504 ist seit 26 Stunden im Status `awaiting_deploy`
- **WHEN** `watchdog.sh` ausgeführt wird (FACTORY_AD_STALE_H=24)
- **THEN** T000504 erhält `attention_mode=needs_human` und einen Warn-Kommentar; der Status bleibt `awaiting_deploy`
