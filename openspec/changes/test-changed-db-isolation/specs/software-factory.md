## MODIFIED Requirements

### Requirement: Watchdog-Eskalation und Zombie-Cleanup

The system SHALL pro Tick stale `in_progress`-Tickets (kein `updated_at`-Update seit
`FACTORY_STALE_MIN` Minuten, Default 30) prüfen, ob bereits ein `FACTORY-PLAN-REF`-Kommentar
(`plan_ref` via `ticket.sh get`) existiert, und den Slot in jedem Fall freigeben sowie den
verwaisten Worktree entfernen.

The stale-selection query SHALL be encapsulatable (a named function) and SHALL offer an
opt-in test-seed exclusion (`FACTORY_STALE_EXCLUDE_TEST_SEEDS=1`): when set, tickets carrying
a deterministic test-seed marker (e.g. a `notes`-style entry or a distinct area/component tag
with a test suffix, as written by `seed_test_feature` in `tests/lib/factory-test-fixtures.sh`)
SHALL NOT be selected, so that parallel `task test:changed` runs against the shared dev
database do not reset each other's in_progress seeds. The default production behavior without
the flag SHALL remain unchanged.

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

#### Scenario: Parallel läufende Watchdog-Tests kollidieren nicht über die geteilte Dev-DB

- **GIVEN** two parallel `task test:changed` runs against the shared dev database
- **AND** each run seeds an `in_progress` test ticket via `seed_test_feature`
- **WHEN** a watchdog test with `FACTORY_STALE_MIN=0` and `FACTORY_STALE_EXCLUDE_TEST_SEEDS=1`
  executes its stale sweep
- **THEN** the sweep selects only the current run's own seeded ticket
- **AND** the other run's seeded ticket keeps its `in_progress` status and pipeline slot

#### Scenario: Produktions-Watchdog bleibt ohne das Test-Flag unverändert

- **GIVEN** a production tick without `FACTORY_STALE_EXCLUDE_TEST_SEEDS`
- **WHEN** the watchdog runs its stale-selection query
- **THEN** the selection behaves exactly as before the flag was introduced
