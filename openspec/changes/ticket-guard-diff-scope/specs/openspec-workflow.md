## ADDED Requirements

### Requirement: .ticket-Guard prüft im PR-Gate nur die geänderten Changes

The `.ticket` completeness guard SHALL be provided as an invocable script
`scripts/openspec-ticket-guard.sh` that accepts an explicit scope. In its default
(PR-gate) mode it SHALL check only those change directories under
`openspec/changes/` that the current branch touches relative to `origin/main`,
and SHALL NOT fail because of a gap in an untouched change directory. In `--all`
mode it SHALL check every change directory, so the full inventory keeps a
scheduled owner instead of decaying unnoticed. In both modes the guard SHALL skip
slugs listed in the allowlist file passed via `--backlog`, SHALL emit a
non-empty summary line naming how many directories were checked, and SHALL exit
non-zero naming every offending slug.

#### Scenario: A gap in an untouched change does not fail a foreign PR

- **GIVEN** a change directory `fremde-luecke` without a `.ticket` file that the
  current branch does not touch
- **AND** a change directory `sauberer-change` with a non-empty `.ticket` file
  that the branch does touch
- **WHEN** the guard runs with the scope restricted to `sauberer-change`
- **THEN** it exits with status 0
- **AND** its output does not name `fremde-luecke`

#### Scenario: A gap inside a touched change still fails

- **GIVEN** a change directory `angefasste-luecke` without a `.ticket` file
- **WHEN** the guard runs with the scope restricted to `angefasste-luecke`
- **THEN** it exits with a non-zero status
- **AND** its output names `angefasste-luecke`

#### Scenario: The full-inventory mode reports untouched gaps

- **GIVEN** the change directories `angefasste-luecke` and `fremde-luecke`, both
  without a `.ticket` file and neither listed in the allowlist
- **WHEN** the guard runs with `--all`
- **THEN** it exits with a non-zero status
- **AND** its output names both slugs

#### Scenario: Allowlisted legacy slugs are skipped in full-inventory mode

- **GIVEN** both gap directories are listed in the file passed as `--backlog`
- **WHEN** the guard runs with `--all`
- **THEN** it exits with status 0

#### Scenario: A PR touching no change directory passes visibly

- **GIVEN** a branch whose diff against `origin/main` contains no path under
  `openspec/changes/`
- **WHEN** the guard runs in its default PR-gate mode
- **THEN** it exits with status 0
- **AND** it emits a non-empty line stating that no change directory was in scope

### Requirement: Der Vollbestandslauf hat einen terminierten Eigentümer

CI SHALL run the guard in `--all` mode on push-to-`main` and on the nightly
schedule of `.github/workflows/ci.yml`, and in the default diff-scoped mode on
`pull_request` events. The mode SHALL be selected by the workflow event, not by
the guard guessing. When the guard cannot resolve its diff base ref, it SHALL
fail with a message that distinguishes this configuration error from a missing
`.ticket` file, rather than silently widening or narrowing its scope.

#### Scenario: Nightly run covers the whole inventory

- **GIVEN** the CI workflow is triggered by `schedule` or by a push to `main`
- **WHEN** the guard step executes
- **THEN** it runs in `--all` mode over every change directory

#### Scenario: Unresolvable base ref is reported as a configuration error

- **GIVEN** the guard runs in default mode and the ref `origin/main` cannot be
  resolved in the checkout
- **WHEN** the guard executes
- **THEN** it exits non-zero with a message naming the unresolvable ref
- **AND** the message does not claim that a `.ticket` file is missing
