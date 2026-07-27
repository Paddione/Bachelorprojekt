## MODIFIED Requirements

### Requirement: Watchdog-Eskalation und Zombie-Cleanup

The system SHALL pro Tick stale `in_progress`-Tickets (kein `updated_at`-Update seit
`FACTORY_STALE_MIN` Minuten, Default 30) prüfen, ob bereits ein `FACTORY-PLAN-REF`-Kommentar
(`plan_ref` via `ticket.sh get`) existiert, und den Slot in jedem Fall freigeben sowie den
verwaisten Worktree entfernen.

Zusätzlich SHALL das System pro stale erkanntem Ticket einen Versuchszähler unter dem Key
`factory_attempt:<external_id>` in `tickets.factory_control` fortschreiben. Der Zähler
SHALL mit einem **non-NULL `brand`**-Wert geschrieben werden, weil `factory_control` ein
`UNIQUE (key, brand)` trägt und Postgres NULL-Werte darin als distinct behandelt — eine
NULL-Brand-Zeile lässt `ON CONFLICT` nie feuern und würde Duplikate ansammeln. Die
Fortschreibung SHALL echten Fortschritt von Stillstand unterscheiden: existiert ein
`tickets.factory_phase_events`-Eintrag, dessen `at` neuer ist als das `updated_at` des
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

### Requirement: Dry-run-first tickets graduate to a real run

The Software Factory pipeline SHALL mark a ticket as dry-run-checked
(`ticket.sh dryrun-mark`) after completing its forced preview run in the
`DRY_RUN` branch, so that `guard_dryrun_ok()` permits a real (non-dry-run)
execution on the ticket's next scheduled tick.

The marking SHALL happen in deterministic code after the Deploy-phase preview agent call
returns, NOT as an instruction inside the agent prompt. A state transition that is the only
way out of the dry-run-first loop SHALL NOT depend on a headless session surviving or on a
model complying with a prompt line. If the agent call aborts (for example because the
configured `ANTHROPIC_BASE_URL` refuses the connection), the marker SHALL remain unset and
the ticket SHALL be bounded by the watchdog's attempt counter instead of looping
indefinitely.

The pipeline file that carries this behaviour is `scripts/factory/pipeline.mjs` — the file
`dispatcher-bridge.sh` launches via the Workflow tool and `run-pipeline.mjs` imports.

#### Scenario: Ticket forced into dry-run by guard_dryrun_ok

- **GIVEN** a ticket has no dry-run-first marker (`ticket.sh dryrun-check`
  exits non-zero)
- **WHEN** the pipeline runs it in the `DRY_RUN` branch and the Deploy-phase preview agent
  call returns successfully
- **THEN** deterministic code — not the agent prompt — calls
  `ticket.sh dryrun-mark --id <ticket>`, so the next tick's `guard_dryrun_ok()` call
  returns true and the ticket runs for real instead of looping through another forced
  preview.

#### Scenario: Dry-run aborts before the marker is set

- **GIVEN** a ticket has no dry-run-first marker and the configured
  `ANTHROPIC_BASE_URL` refuses connections
- **WHEN** the pipeline enters the `DRY_RUN` branch and the Deploy-phase preview agent call
  throws
- **THEN** the marker stays unset and the ticket keeps returning to the queue, but the
  watchdog's `factory_attempt` counter bounds the repetition and escalates via
  `ticket.sh unfactory` once `FACTORY_MAX_ATTEMPTS` is reached — the ticket does not loop
  indefinitely.

## ADDED Requirements

### Requirement: Permanent dispatch exclusion via unfactory

The system SHALL provide `ticket.sh unfactory --id <external_id>` as the terminal state for
a ticket the Software Factory could not complete. The subcommand SHALL set, in one
statement block so no partially applied state can be observed:

- `status = blocked`
- `attention_mode = needs_human`
- `readiness.factory_excluded = true`
- a closing comment naming the attempt count and the most recent phase event

`scripts/factory/queue.sh` SHALL exclude tickets carrying
`readiness.factory_excluded = true` from **both** dispatch branches (the
`type='feature' AND status='backlog'` branch and the `type='task' AND status='plan_staged'`
branch) via `COALESCE((readiness->>'factory_excluded')::boolean, false) = false`. The
default `false` is deliberate: an absent flag SHALL NOT exclude a ticket, consistent with
`lastenheft_locked` (default false) and `execution_released` (default true).

The exclusion SHALL survive a later status change, so returning the ticket to
`plan_staged` by hand or by another script does NOT re-expose it to dispatch. Clearing the
flag SHALL require an explicit human action
(`ticket.sh plan-meta set --readiness factory_excluded=false`).

#### Scenario: Unfactored ticket is not dispatched even in a dispatchable status

- **GIVEN** Ticket T002338 (`type=task`) carries `readiness.factory_excluded = true` and
  someone sets its status back to `plan_staged`
- **WHEN** `queue.sh` runs for its brand
- **THEN** T002338 does not appear in the returned JSON array

#### Scenario: Tickets without the flag are unaffected

- **GIVEN** Ticket T002400 (`type=task`, `status=plan_staged`) has no `factory_excluded`
  key in its `readiness` object
- **WHEN** `queue.sh` runs for its brand
- **THEN** T002400 appears in the returned JSON array
