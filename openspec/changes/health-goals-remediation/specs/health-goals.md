## ADDED Requirements

### Requirement: REQ-HEALTH-GOALS-010 — Measurement Robustness Against Structural Drift

`scripts/health-goals-check.sh` SHALL measure goals against the actual current structure of the
files it inspects (`AGENTS.md` headings, `pg_stat_statements` privilege masking, GitHub Actions run
selection) rather than against assumptions frozen at the time the check was written. When a
measurement's assumption about file structure changes (e.g. a heading moves into a collapsible
`<details>` block, a query text becomes privilege-masked for the checking role), the check SHALL be
updated to keep measuring the same underlying condition, not silently regress to a false positive.

#### Scenario: Agent-routing drift check finds the domain-agent table regardless of markdown nesting

- **GIVEN** `AGENTS.md` contains the Claude Code domain-agent routing table nested inside a
  `<details>` block under `## Reference Sections`, not directly under a `## Agent Routing` heading
- **WHEN** `scripts/health-goals-check.sh --only=G-AGENTIC02` runs
- **THEN** it locates and parses that table, and reports zero mismatches when `CLAUDE.md`'s routing
  table and each `.claude/agents/bachelorprojekt-*.md` frontmatter's trigger tokens actually agree

#### Scenario: Slow-query check excludes the known one-off DDL event even when query text is masked

- **GIVEN** a `pg_stat_statements` row for a one-off `CREATE INDEX` DDL event executed by a
  different Postgres role than the checking role, whose `query` column is masked as
  `<insufficient privilege>`
- **WHEN** `scripts/health-goals-check.sh --only=G-DB09` runs
- **THEN** the known one-off event is still excluded from the slow-query count (via a mechanism that
  does not depend on reading the masked query text), and G-DB09 reports 0

#### Scenario: E2E success rate counts only scheduled nightly runs

- **GIVEN** the most recent `e2e.yml` workflow runs include both `workflow_dispatch` (manual,
  frequently cancelled) and `schedule` (nightly) triggered runs
- **WHEN** `scripts/health-goals-check.sh --only=G-E2E01` runs
- **THEN** only `event=schedule` runs are included in the success-rate calculation

### Requirement: REQ-HEALTH-GOALS-011 — Skill Registry Consistency

`.claude/skills/OVERVIEW.md` SHALL accurately reflect the count of tracked skills
(`git ls-files -- .claude/skills | grep -c '/SKILL\.md$'`) and SHALL reference every active skill at
least once (in `OVERVIEW.md` itself, `CLAUDE.md`, `AGENTS.md`, or another `SKILL.md`). Every script
path an active `SKILL.md` invocation example references SHALL exist at that exact path from the repo
root.

#### Scenario: No orphaned active skills

- **GIVEN** all tracked `.claude/skills/**/SKILL.md` files
- **WHEN** each skill's basename is searched for in `CLAUDE.md`, `AGENTS.md`, `OVERVIEW.md`, and
  every other `SKILL.md`
- **THEN** every skill has at least one reference

#### Scenario: No dead script paths in gitops-repo-audit

- **GIVEN** `.claude/skills/gitops-repo-audit/SKILL.md`'s invocation examples
- **WHEN** each referenced script path is checked for existence from the repo root
- **THEN** all referenced paths exist

### Requirement: REQ-HEALTH-GOALS-012 — SKILL.md Line Budget

Every `.claude/skills/**/SKILL.md` file SHALL stay at or under 500 lines. Content that pushes a
skill over budget SHALL be extracted into a `references/` file linked from the skill rather than
trimmed for correctness.

#### Scenario: dev-flow-plan/SKILL.md stays within budget

- **GIVEN** `.claude/skills/dev-flow-plan/SKILL.md`
- **WHEN** `wc -l` is run against it
- **THEN** the line count is <= 500

### Requirement: REQ-HEALTH-GOALS-013 — E2E Test-Data Purge Failure Visibility

The post-run test-data purge step in `.github/workflows/e2e.yml` SHALL surface failures instead of
silently swallowing them, so a failed purge is visible in the workflow run rather than masked by an
unconditional success exit.

#### Scenario: Purge failures are visible in the workflow run

- **GIVEN** the post-run purge step's `curl` call to `/api/admin/systemtest/purge-all-test-data`
  fails (non-2xx response or network error)
- **WHEN** the `e2e.yml` workflow run completes
- **THEN** the failure is visible in the step's output/annotations rather than swallowed by an
  unconditional `|| true`
