## ADDED Requirements

### Requirement: Der Worktree-Sauberkeits-Vorcheck unterscheidet "sauber" von "nicht prüfbar"

Der Vorcheck vor `git worktree remove` im repo-hygiene-Runbook §1 SHALL be provided as an
executable script `scripts/worktree-clean-check.sh <path>` rather than as an inline shell
pipeline, and it SHALL distinguish three outcomes by exit code: clean (0), finding — the
worktree carries non-allowlisted changes (1), and not checkable — the directory is absent
or `git status` failed (2). The runbook §1 SHALL invoke that script as its operative
pre-check.

The inline pipeline it replaces discarded the exit code of `git status --porcelain`
through the pipe, so a missing worktree directory produced empty output that was
indistinguishable from a clean tree, i.e. a release to remove. This is the same defect
class as T003109 (a quantifier over the empty set) and T003278 (a runner exiting 0 on a
missing file): a check passes silently because its substance is absent.

#### Scenario: A missing worktree directory is not reported as clean

- **GIVEN** a path that does not exist on disk
- **WHEN** `scripts/worktree-clean-check.sh <path>` runs
- **THEN** it exits non-zero and names the offending path in its output, so the caller
  cannot read the result as a release to remove

#### Scenario: A path that is not a git repository is not reported as clean

- **GIVEN** an existing directory in which `git status` fails
- **WHEN** `scripts/worktree-clean-check.sh <path>` runs
- **THEN** it exits non-zero rather than treating the empty status output as cleanliness

#### Scenario: An existing clean worktree is still reported as clean

- **GIVEN** an existing git worktree with no changes
- **WHEN** `scripts/worktree-clean-check.sh <path>` runs
- **THEN** it exits 0 — the hardening does not turn the normal case into a blocker

#### Scenario: The generated-artifact allowlist from §1 keeps its effect

- **GIVEN** a worktree whose only deviations are Freshness generates
  (`openspec/changes/`, `docs/code-quality/`, `website/src/data/` and the release files)
- **WHEN** `scripts/worktree-clean-check.sh <path>` runs
- **THEN** it exits 0, while a deviation on any other path exits 1 and names that path

#### Scenario: The runbook calls the guard instead of quoting a pipeline

- **GIVEN** the repo-hygiene runbook `.claude/skills/references/repo-hygiene-ops.md`
- **WHEN** §1 describes the pre-check before `git worktree remove`
- **THEN** it invokes `scripts/worktree-clean-check.sh`, because a guard only takes effect
  where it is actually executed
