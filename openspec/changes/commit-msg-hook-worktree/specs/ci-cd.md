## MODIFIED Requirements

### Requirement: commit-vs-diff-consistency-guard

The system SHALL reject any commit whose subject uses an implementation type (`fix`, `feat`, `refactor`, `perf`, including the breaking-change marker `!`) but whose staged diff contains only test/spec/plan artifacts (no production-code change). The guard is implemented as `scripts/check-commit-vs-diff.sh` wired into the `.githooks/commit-msg` hook (blockierend) and mirrored into the CI `commit-lint` job (catches bypasses).

The `commit-msg` hook SHALL resolve its guard scripts (`scripts/check-commit-vs-diff.sh`,
`scripts/check-fix-ticket-guard.sh`, `scripts/validate-commit-msg.sh`) in a worktree-capable
way: when a guard script is absent from the current worktree's branch state, the hook SHALL
fall back to the main checkout (resolved via `git rev-parse --git-common-dir`'s parent
directory) instead of letting the guard run empty or fail silently. The same resolution SHALL
apply to the `pre-commit` and `pre-push` hooks wherever they reference `$repo_root/scripts/`.

**Background (T001434-mishap, 2026-07-02):** a dev-flow-plan stage commit used
`fix(infra): chain loggingMiddleware in middleware.ts via sequence() [T001434]` as its
title, but the diff only contained the RED integration test plus plan artifacts. The
next implementer (dev-flow-execute) trusted the title and skipped the actual fix; the
bug landed in a follow-up commit instead of the same PR. The dev-flow-plan SKILL.md
now mandates `chore(plans):` for plan-stage commits; this guard is the belt-and-suspenders
backstop for any future SKILL-deviation or human bypass.

#### Scenario: Plan-stage commit with implementation-type subject is blocked

- **GIVEN** a developer runs `git add openspec/changes/<slug>/ website/src/middleware.test.ts`
- **AND** the commit message is `fix(infra): chain loggingMiddleware in middleware.ts via sequence() [T001434]`
- **WHEN** `git commit` is invoked
- **THEN** the `commit-msg` hook runs `scripts/check-commit-vs-diff.sh`
- **AND** the hook rejects the commit with exit code 1
- **AND** the error message references the T001434 mishap pattern
- **AND** the error message suggests `test(red):` or `chore(plan):` as the correct prefixes

#### Scenario: Implementation commit with real production code passes

- **GIVEN** a developer runs `git add website/src/middleware.ts website/src/middleware.test.ts`
- **AND** the commit message is `fix(infra): chain loggingMiddleware in middleware.ts via sequence() [T001434]`
- **WHEN** `git commit` is invoked
- **THEN** the `commit-msg` hook runs `scripts/check-commit-vs-diff.sh`
- **AND** the hook accepts the commit with exit code 0

#### Scenario: Plan-stage commit with chore(plans): prefix passes

- **GIVEN** a developer runs `git add openspec/changes/<slug>/`
- **AND** the commit message is `chore(plans): stage <slug> for execution [T-...]`
- **WHEN** `git commit` is invoked
- **THEN** the `commit-msg` hook accepts the commit (no implementation-type claim)

#### Scenario: Bypass for emergency

- **GIVEN** a developer runs `SKIP_COMMIT_VS_DIFF=1 git commit ...` with an otherwise-blocked subject/diff pair
- **WHEN** the `commit-msg` hook runs
- **THEN** the hook prints a `⚠  SKIP_COMMIT_VS_DIFF=1` warning but exits 0

#### Scenario: Commit in einem Worktree ohne Guard-Skript läuft über den Haupt-Checkout-Fallback

- **GIVEN** a worktree whose branch state lacks `scripts/check-fix-ticket-guard.sh`
- **AND** the main checkout (via `git rev-parse --git-common-dir`) still carries the script
- **WHEN** `git commit` runs inside that worktree with a subject containing a valid ticket id
- **THEN** the `commit-msg` hook resolves the guard via the main checkout
- **AND** the commit is accepted (exit code 0) — the guard does not run empty and does not fail silently
