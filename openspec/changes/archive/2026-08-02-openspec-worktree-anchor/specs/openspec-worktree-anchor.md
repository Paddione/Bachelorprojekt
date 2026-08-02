## ADDED Requirements

### Requirement: openspec.sh SHALL anchor REPO on the caller's working directory

`scripts/openspec.sh` and `scripts/openspec-status-map.sh` SHALL derive their
repo root from the caller's actual working directory (`git rev-parse
--show-toplevel`), not from the physical path used to invoke the script
file.

#### Scenario: script invoked via a wrong relative path from a worktree

- **GIVEN** the caller's `$PWD` is a valid git worktree (e.g.
  `.worktrees/<slug>/`)
- **AND** the script is invoked via a relative path that resolves outside
  that worktree (e.g. `../../scripts/openspec.sh`)
- **WHEN** `openspec.sh propose <slug> --ticket <id>` runs
- **THEN** the change folder is created under the caller's worktree
  (`$PWD/openspec/changes/<slug>/`), not under whatever directory the
  invocation path happened to resolve into

#### Scenario: script invoked normally

- **GIVEN** the caller's `$PWD` is the intended checkout
- **WHEN** the script is invoked with its normal relative path
  (`scripts/openspec.sh ...`)
- **THEN** behavior is unchanged from before this fix
