# devflow-selection-archive-hardening — Delta-Spec

## Purpose

T009368: `devflow-post-merge-deploy.sh` wählt den Merge-Commit eines Tickets per
`git log --grep "[TICKET_ID]" -1` aus — der neueste Commit mit Ticket-ID im Subject.
OpenSpec-Archiv-Commits (`chore(plans): archive …`) tragen dieselbe Ticket-ID im Subject;
merged der Archiv-PR vor dem Deploy-Lauf, trifft die Selektion den Archiv-Commit, dessen Diff
nur `openspec/changes/archive/`-Pfade enthält → "Keine bekannten Deploy-Trigger", kein
deploy:done-Phase-Event, kein Closure-Scan (beobachtet T008017: getroffen `673f14a48` statt
Feature-Merge `abda93f9a`).

## ADDED Requirements

### Requirement: Merge-commit selection excludes archive commits

`scripts/devflow-post-merge-deploy.sh` SHALL select the most recent commit on `origin/main`
whose subject contains the bracketed ticket ID (`[TXXXXXX]`) and SHALL exclude commits of the
OpenSpec archive class (subject containing `chore(plans): archive`) from that selection. The
selection SHALL be implemented as the reusable function `select_merge_commit <repo>
<ticket_id>` so tests can run it against fixture repositories (output verification,
T002448-M4). The exclusion SHALL NOT be implemented as the `git log` flag combination
`--grep=<id> --grep="chore(plans): archive" --all-match --invert-match` — that combination
matches commits that fail to match BOTH patterns and therefore also admits commits without
the ticket ID.

#### Scenario: A newer archive commit does not shadow the feature merge commit

- **GIVEN** `origin/main` contains a feature squash commit `feat(foo): implement x [T009999]` and a NEWER archive commit `chore(plans): archive foo → bar [T009999]`
- **WHEN** `select_merge_commit <repo> T009999` runs against that repository
- **THEN** it returns the feature commit SHA
- **AND** the archive commit is not returned

#### Scenario: Missing ticket ID fails the deploy script

- **GIVEN** no commit on `origin/main` carries `[T009998]`
- **WHEN** `scripts/devflow-post-merge-deploy.sh T009998` runs
- **THEN** it exits with code 3 and prints `Kein Merge-Commit`

#### Scenario: A feature commit without an archive successor is still selected

- **GIVEN** `origin/main` contains only the feature squash commit `feat(foo): implement x [T009999]`
- **WHEN** `select_merge_commit <repo> T009999` runs against that repository
- **THEN** it returns the feature commit SHA
