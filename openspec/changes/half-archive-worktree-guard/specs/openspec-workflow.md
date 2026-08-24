## ADDED Requirements

### Requirement: Half-archive-Check sichtet Worktrees auf verlorenen Archivierungen

`scripts/openspec-half-archive-check.sh` SHALL additionally inspect every registered git
worktree (`git worktree list --porcelain`, excluding the main checkout) for uncommitted
half-archive states: a slug whose source directory under `openspec/changes/` is deleted or an
archive entry `openspec/changes/archive/<date>-<slug>/` that is untracked/staged-only in that
worktree, while the corresponding state does not exist on `origin/main`. Each finding SHALL be
reported as a warning naming the worktree path and the slug, with a heal hint.

#### Scenario: Uncommitted archive work in a worktree is reported

- **GIVEN** a secondary worktree holds uncommitted archive work (source dir deleted,
  archive dir untracked) for a change that on `origin/main` still lives under `changes/`
- **WHEN** the half-archive check runs
- **THEN** it prints one warning line per finding with the worktree path and the slug

#### Scenario: Clean or absent worktrees produce no findings

- **GIVEN** no worktrees exist besides the main checkout, or all of them are clean regarding
  `openspec/changes/**`
- **WHEN** the half-archive check runs
- **THEN** no worktree warnings are printed and the existing main-checkout verdict is unchanged

### Requirement: Worktree-Befunde warnen standardmäßig und failen nur im Strict-Modus

Worktree findings SHALL NOT flip the check's exit code by default (parallel sessions legitimately
carry in-flight archive work), so commits invoking the guard stay unaffected. Only with
`OPENSPEC_HALF_ARCHIVE_WT_STRICT=1` SHALL any worktree finding turn into exit code 1. The
existing main-checkout failure classes (duplicate slug, missing date prefix) keep their current
fail-closed behavior unchanged.

#### Scenario: Warning mode keeps exit code green

- **GIVEN** a worktree carries a half-archive finding and the strict variable is unset
- **WHEN** the half-archive check runs as part of a pre-commit hook
- **THEN** warnings are printed but the overall exit code stays 0

#### Scenario: Strict mode fails on findings

- **GIVEN** `OPENSPEC_HALF_ARCHIVE_WT_STRICT=1` and a worktree carries a finding
- **WHEN** the half-archive check runs
- **THEN** the script exits 1 after reporting all findings
