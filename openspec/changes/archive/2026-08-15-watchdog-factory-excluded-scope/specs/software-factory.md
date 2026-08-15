## MODIFIED Requirements

### Requirement: Watchdog-Eskalation und Zombie-Cleanup

The system SHALL pro Tick stale `in_progress`-Tickets (kein `updated_at`-Update seit
`FACTORY_STALE_MIN` Minuten, Default 30) prüfen, ob bereits ein `FACTORY-PLAN-REF`-Kommentar
(`plan_ref` via `ticket.sh get`) existiert, und den Slot in jedem Fall freigeben sowie den
verwaisten Worktree entfernen.

Der Stale-Sweep SHALL Tickets ausschließen, deren `readiness.factory_excluded` auf `true`
gesetzt ist — dasselbe Gate, das `queue.sh` in beiden Dispatch-Lanes anwendet
(`COALESCE((readiness->>'factory_excluded')::boolean, false) = false`). `factory_excluded`
ist die dauerhafte Hälfte von `ticket.sh unfactory` und der dokumentierte Weg, ein Ticket
bewusst von der Factory fernzuhalten (z. B. manuelle Übernahme eines gestagten Tickets
durch dev-flow-execute, Fortsetzungs-Kontrakt T002327). Der Watchdog SHALL diese
menschliche Entscheidung nicht durch einen Status-Reset oder eine Eskalation rückgängig
machen: Ein ausgeschlossenes Ticket SHALL weder zurückgesetzt noch unfactored werden.

Ohne den Ausschluss entsteht ein Resume-Livelock: Ein `in_progress`-Ticket mit lebender
manueller Session (branch-scoped Claim) wird bei `FACTORY_STALE_MIN=0` jeden Tick auf
`plan_staged` zurückgesetzt, von `queue.sh` erneut dispatcht und von der Pipeline am
fremden Claim deferriert (T003677) — der Status bleibt `in_progress` und der nächste Tick
resettet erneut (beobachtet an T005560, 2026-08-14, 22:41–22:54 UTC).

Zusätzlich SHALL das System pro stale erkanntem Ticket einen Versuchszähler unter dem Key
`factory_attempt:<external_id>` in `tickets.factory_control` fortschreiben. Der Zähler
SHALL mit einem **non-NULL `brand`**-Wert geschrieben werden, weil `factory_control` ein
`UNIQUE (key, brand)` trägt und Postgres NULL-Werte darin als distinct behandelt — eine
NULL-Brand-Zeile lässt `ON CONFLICT` nie feuern und würde Duplikate ansammeln. Die
Fortschreibung SHALL echten Fortschritt von Stillstand unterscheiden: existiert ein
`tickets.factory_phase_events`-Eintrag mit `state IN ('done', 'partial-done', 'blocked')`,
dessen `at` neuer ist als das `updated_at` des
Zählers, SHALL der Zähler auf `1` zurückgesetzt werden; andernfalls SHALL er um `1` erhöht
werden. `tickets.updated_at` SHALL für diesen Vergleich NICHT verwendet werden, da
`fn_lifecycle_ts` es bei jedem Zeilen-Write erhöht und ein reiner `touch` damit als
Fortschritt erschiene.

Solange der Zähler unter `FACTORY_MAX_ATTEMPTS` (Default 3) liegt, gilt das bisherige
Reset-Verhalten:

- Existiert **kein** `plan_ref` (noch nie geplant), setzt das System den Status auf `triage`
  zurück (unverändertes Verhalten).
- Existiert bereits ein `plan_ref` und `type='feature'`, setzt das System den Status auf
  `backlog` zurück, statt die bereits geleistete Planungsarbeit über `triage` zu verwerfen —
  das Ticket re-qualifiziert sich direkt für `queue.sh`s Dispatch-Gate (bleibt
  `lastenheft_locked`) und `pipeline.mjs` erkennt `FACTORY-PLAN-REF` beim nächsten Dispatch
  automatisch, überspringt Scout/Design/Plan und setzt bei Implement fort.
- Existiert bereits ein `plan_ref` und `type='task'`, setzt das System den Status auf
  `plan_staged` zurück (matcht `queue.sh`s bestehenden Task-Dispatch-Pfad).

Erreicht der Zähler `FACTORY_MAX_ATTEMPTS`, SHALL das System statt eines weiteren Resets
`ticket.sh unfactory` aufrufen. Slot-Freigabe und Zombie-Worktree-Cleanup SHALL dabei
unverändert weiterlaufen — die Eskalation ersetzt ausschließlich das Status-Ziel.

Ist der Zähler nicht lesbar oder nicht schreibbar, SHALL sich der Watchdog wie ohne Zähler
verhalten (Reset auf `triage`/`backlog`/`plan_staged`) und den Fehler protokollieren. Ein
Datenbankproblem SHALL NICHT dazu führen, dass Tickets in den Terminalzustand versetzt
werden.

`awaiting_deploy`-Features ohne Deployment seit `FACTORY_AD_STALE_H` Stunden (Default 24)
werden mit `attention_mode=needs_human` markiert und erhalten einen Warn-Kommentar
(unverändert).

#### Scenario: Manuell übernommenes Ticket (factory_excluded) wird nicht zurückgesetzt

- **GIVEN** Ticket T005560 (`type=fix`, `plan_ref` vorhanden) ist `in_progress`; eine
  manuelle Session hält den branch-scoped Claim; `readiness.factory_excluded=true` wurde
  über `ticket.sh plan-meta set --readiness factory_excluded=true` gesetzt
- **WHEN** `watchdog.sh` ausgeführt wird (FACTORY_STALE_MIN=0)
- **THEN** das Ticket wird NICHT zurückgesetzt, erhält keinen Reset-Kommentar und wird
  nicht eskaliert — der Status bleibt `in_progress` (identisch zur Dispatch-Sperre in
  `queue.sh`)

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
  erneut einen Slot und `pipeline.mjs` fährt bei Implement fort, statt Scout/Design/Plan zu
  wiederholen

#### Scenario: Versuchszähler steigt bei Stillstand ohne Phase-Event
- **GIVEN** Ticket T002338 (`type=task`, `plan_ref` vorhanden) ist stale, sein Zähler
  `factory_attempt:T002338` steht auf `1`, und seit dem Zähler-Write existiert kein neuerer
  `factory_phase_events`-Eintrag
- **WHEN** `watchdog.sh` ausgeführt wird (FACTORY_MAX_ATTEMPTS=3)
- **THEN** der Zähler steht auf `2`; T002338 erhält `status=plan_staged`; der Slot ist frei

#### Scenario: Versuchszähler wird durch echten Fortschritt zurückgesetzt
- **GIVEN** Ticket T002338 ist stale, sein Zähler steht auf `2`, und es existiert ein
  `factory_phase_events`-Eintrag, dessen `at` neuer ist als das `updated_at` des Zählers
- **WHEN** `watchdog.sh` ausgeführt wird
- **THEN** der Zähler steht auf `1` statt auf `3`; T002338 wird nicht eskaliert

#### Scenario: Eskalation bei Erreichen von FACTORY_MAX_ATTEMPTS
- **GIVEN** Ticket T002338 ist stale, sein Zähler steht auf `2`, es gibt keinen neueren
  `factory_phase_events`-Eintrag, und `FACTORY_MAX_ATTEMPTS=3`
- **WHEN** `watchdog.sh` ausgeführt wird
- **THEN** `ticket.sh unfactory --id T002338` wird aufgerufen; der Status wird NICHT auf
  `plan_staged` zurückgesetzt; `pipeline_slot=NULL` und der Zombie-Worktree-Cleanup laufen
  trotzdem

#### Scenario: Stale awaiting_deploy
- **GIVEN** Ticket T000504 ist seit 26 Stunden im Status `awaiting_deploy`
- **WHEN** `watchdog.sh` ausgeführt wird (FACTORY_AD_STALE_H=24)
- **THEN** T000504 erhält `attention_mode=needs_human` und einen Warn-Kommentar; der Status bleibt `awaiting_deploy`
