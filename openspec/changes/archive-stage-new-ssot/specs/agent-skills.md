## ADDED Requirements

### Requirement: The archive commit carries every SSOT spec its deltas target

`archive_stage_commit <slug> [archive-flags...]` in `scripts/lib/archive-staged-scope.sh` SHALL stage, for every delta file `openspec/changes/archive/<date>-<slug>/specs/<name>.md`, the SSOT path `openspec/specs/<name>.md`, whether that file is tracked or newly created. It SHALL NOT stage any other untracked file under `openspec/specs/`. After staging it SHALL verify that each such target path is present in the index; if one is missing it SHALL exit non-zero and name the missing path. When the flags include `--no-merge`, no delta was merged and the function SHALL skip both the targeted staging and the verification. `scripts/devflow-post-merge-finalize.sh` SHALL pass the flags it gave to `openspec.sh archive`.

Rationale: the function staged `openspec/specs` with `git add -u`, which only covers tracked files. A spec that `openspec.sh archive --create-new` creates is untracked, so it never reached the archive commit. Change `application-pipeline` (epic T900228, #5732) was moved into the archive while its SSOT spec with five requirements stayed behind on the finalizer's branch; the gap went unnoticed until 2026-09-23.

#### Scenario: A spec created by --create-new is staged

- **GIVEN** an archived change whose delta `neu.md` has no SSOT spec on the base branch, and `openspec/specs/neu.md` was just created by the archive merge
- **WHEN** `archive_stage_commit <slug>` runs
- **THEN** `openspec/specs/neu.md` is in the index

#### Scenario: A modified existing spec is still staged

- **GIVEN** an archived change whose delta targets a tracked SSOT spec that the merge modified
- **WHEN** `archive_stage_commit <slug>` runs
- **THEN** that spec and the archive move are in the index

#### Scenario: An unrelated untracked spec stays out

- **GIVEN** an untracked `openspec/specs/fremd.md` that no delta of the change targets
- **WHEN** `archive_stage_commit <slug>` runs
- **THEN** the change's own target specs are in the index and `openspec/specs/fremd.md` is not

#### Scenario: A missing target spec fails closed

- **GIVEN** an archived change whose delta `neu.md` targets `openspec/specs/neu.md`, and that file does not exist
- **WHEN** `archive_stage_commit <slug>` runs
- **THEN** it exits non-zero and its output names `openspec/specs/neu.md`

#### Scenario: A no-merge archive skips the target check

- **GIVEN** an archived change whose delta targets a spec that does not exist, archived with `--no-merge`
- **WHEN** `archive_stage_commit <slug> --no-merge` runs
- **THEN** it exits zero and the archive move is in the index
