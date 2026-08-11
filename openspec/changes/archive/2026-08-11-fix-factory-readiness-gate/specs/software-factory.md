## MODIFIED Requirements

### Requirement: Feature-Branch Readiness-Check
<!-- bats: factory-readiness.bats | readiness-gate-before-launch.bats -->

The system SHALL, before advancing a feature into implementation, verify that the target branch exists on `origin` and that the plan file is present on that branch. Missing arguments, unknown branches, or missing plan files each produce a distinct JSON error reason with exit code 1.

`scripts/factory/dispatcher-bridge.sh` SHALL call this check for every launch row
before spawning an executor, and SHALL skip the launch when the check reports
`ready:false`. The skip SHALL name the ticket and the reason on stderr — a silent
skip is the failure mode T003269 already had to fix once for the prep file.

The check SHALL remain the single implementation of this rule: callers SHALL NOT
re-implement branch/plan validation, and in particular SHALL NOT rely on their own
handling of the literal string `"null"`, which `readiness-check.sh` already treats
as a missing argument.

#### Scenario: Fehlende Argumente liefern missing_args *(BATS)*
- **GIVEN** `readiness-check.sh` wird mit leeren Strings aufgerufen
- **WHEN** `bash readiness-check.sh "" ""` ausgeführt wird
- **THEN** Exit 1; Ausgabe enthält `"ready":false` und `missing_args`

#### Scenario: Unbekannter Branch liefert no_branch *(BATS)*
- **GIVEN** ein lokaler git-Klon mit einem bekannten Branch `feature/has-plan`
- **WHEN** `readiness-check.sh feature/does-not-exist docs/.../test-plan.md` aufgerufen wird
- **THEN** Exit 1; Ausgabe enthält `"ready":false` und `no_branch`

#### Scenario: Plan-Datei fehlt auf dem Branch -> no_plan_on_branch *(BATS)*
- **GIVEN** Branch `feature/has-plan` existiert auf `origin`, aber `missing.md` ist nicht committet
- **WHEN** `readiness-check.sh feature/has-plan docs/.../missing.md` aufgerufen wird
- **THEN** Exit 1; Ausgabe enthält `"ready":false` und `no_plan_on_branch`

#### Scenario: Branch und Plan-Datei vorhanden -> ready *(BATS)*
- **GIVEN** Branch `feature/has-plan` existiert auf `origin` und `test-plan.md` ist committet
- **WHEN** `readiness-check.sh feature/has-plan docs/.../test-plan.md` aufgerufen wird
- **THEN** Exit 0; Ausgabe enthält `"ready":true` und `"reason":"ok"`

#### Scenario: Planlose Launch-Zeile wird nicht gelauncht *(BATS)*
- **GIVEN** ein Prep-File mit einer launch-Zeile, deren `branch` und `plan_path` den Literalstring `"null"` tragen
- **WHEN** `dispatcher-bridge.sh <prep> --dry-run` ausgeführt wird
- **THEN** die Ausgabe enthält KEIN `would launch pipeline for <ticket>` und nennt Ticket und Readiness-Grund

#### Scenario: Vollständige Launch-Zeile wird weiterhin gelauncht *(BATS)*
- **GIVEN** ein Prep-File mit einer launch-Zeile, deren Branch auf `origin` existiert und deren Plan-Datei dort committet ist
- **WHEN** `dispatcher-bridge.sh <prep> --dry-run` ausgeführt wird
- **THEN** die Ausgabe enthält `would launch pipeline for <ticket>`

---

## ADDED Requirements

### Requirement: Executor arbeitet nie im Haupt-Checkout
<!-- bats: readiness-gate-before-launch.bats -->

`scripts/factory/opencode-exec.sh` SHALL treat the literal string `"null"` for
branch and plan path as absent, and SHALL abort with an `implement`/`blocked`
phase event (`detail.reason = "no_plan"`) instead of running the orchestrator.

The launch directory fallback in `dispatcher-bridge.sh` SHALL NOT be reached for
a launch row without branch and plan: the readiness gate above rejects such rows
earlier. This requirement is the second line of defence — a factory run that
edits the shared main checkout can rename or rebase another session's branch
(observed 2026-08-11 for T003740).

#### Scenario: Executor lehnt planlosen Lauf ab, statt in den Haupt-Checkout auszuweichen
- **GIVEN** `opencode-exec.sh` wird mit branch=`null` und plan_path=`null` aufgerufen
- **WHEN** das Skript läuft
- **THEN** Exit ≠ 0, kein `opencode run` wurde gestartet, und ein `implement`/`blocked`-Event mit `reason=no_plan` ist geschrieben
