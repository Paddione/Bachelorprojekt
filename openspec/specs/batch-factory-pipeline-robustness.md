# batch-factory-pipeline-robustness

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu batch-factory-pipeline-robustness ergänzen._

## Requirements

### Requirement: The factory stops dispatching a plan after three consecutive no-commit runs

The factory pipeline SHALL count consecutive implementation runs that end with exit 6 (no commit and no working-tree change) per ticket via `ticket.sh retry-count`. A run that produced a commit SHALL reset the counter. After three consecutive no-commit runs, the factory SHALL reset the ticket to `planning`, release the pipeline slot, free the worktree (best-effort), and leave a comment explaining that the plan is not implementable with the current setup — instead of re-dispatching the same ticket forever.

#### Scenario: Three consecutive exit-6 runs stop the retry loop

- **GIVEN** a ticket whose first three factory runs each end with exit 6 (no implementation commit, no working-tree change)
- **WHEN** the third run finishes its exit-6 handling
- **THEN** the ticket status is `planning`, the pipeline slot is released, the worktree is removed, and a comment documents the reset
- **AND** the retry counter is reset so a later re-dispatch starts fresh

#### Scenario: A successful commit resets the counter

- **GIVEN** a ticket with two consecutive exit-6 runs (counter at 2)
- **WHEN** the next run produces an implementation commit
- **THEN** the retry counter is reset to 0 and the ticket proceeds normally

### Requirement: The FACTORY_CTX default is visible immediately on sourcing lib.sh

`scripts/factory/lib.sh` SHALL resolve the `FACTORY_CTX` default (`k3d-mentolder-dev`) at top level, so that merely sourcing the file exposes a valid context. The default SHALL NOT wait until `factory_resolve_data_ns` runs, and the explicit override via `FACTORY_CTX` SHALL remain honored.

#### Scenario: Sourcing lib.sh alone exposes a valid context

- **GIVEN** an environment without `FACTORY_CTX` set
- **WHEN** a script sources `scripts/factory/lib.sh`
- **THEN** `FACTORY_CTX` is already `k3d-mentolder-dev` without calling `factory_resolve`
- **AND** a later explicit `FACTORY_CTX=...` override still wins

<!-- merged from change delta batch-factory-pipeline-robustness.md (07323eba4915) -->

### Requirement: Merged-PR-Gate schließt gemergte Tickets vor dem Dispatch

Das Merged-PR-Gate in `scripts/factory/schedule.sh` SHALL unabhängig von der
verfügbaren Slot-Kapazität ausgeführt werden. Ein Kandidat, dessen PR bereits auf
`origin/main` gemergt ist (`check-merged` rc=1), SHALL zu `done` mit passender
Resolution geschlossen werden — auch wenn das Global-Cap bereits ausgeschöpft ist.
Der Cap-Break gilt nur für den Dispatch-Pfad (Claim/Slot-Belegung).

#### Scenario: Kapazitätsdruck verhindert das Schließen nicht mehr

- **GIVEN** der Slot-Pool beider Brands ist so belegt, dass
  `global_used >= FACTORY_GLOBAL_CAP`, bevor alle Kandidaten iteriert wurden
- **AND** ein plan_staged-Kandidat trägt einen auf main gemergten PR-Beleg
- **WHEN** `schedule.sh` die Kandidaten-Schleife ausführt
- **THEN** wird der gemergte Kandidat auf `done/fixed` geschlossen und mit einem
  "gemergt"-Kommentar versehen
- **AND** er erscheint nicht im Launch-Plan und belegt keinen Slot

#### Scenario: Fixture bleibt unter paralleler Slot-Belegung deterministisch

- **GIVEN** der merged-dispatch-gate-Test seedet sein Fixture-Ticket mit
  historischem `created_at`
- **WHEN** andere Sessions während des Testlaufs Slots belegen
- **THEN** erreicht das Fixture-Ticket das Merged-Gate trotzdem, weil es nach
  `ORDER BY … created_at ASC` vor jüngeren Kandidaten sortiert

#### Scenario: Skip-Guard bleibt Skip

- **GIVEN** der Slot-Pool ist beim Teststart zu stark belegt (`_skip_if_pool_busy`)
- **WHEN** der Test läuft
- **THEN** skippt er sichtbar (TAP `# skip`) statt echte Tickets im Live-Dev-DB-Modus
  zu gefährden — ein Skip wird dadurch aber nicht als inhaltlicher Erfolg gezählt;
  die Flakiness-Ursache ist durch die beiden Szenarien oben beseitigt

<!-- merged from change delta batch-factory-pipeline-robustness.md (556cbe63287b) -->