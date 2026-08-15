# devflow-selection-archive-hardening

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu devflow-selection-archive-hardening ergänzen._

## Requirements

### Requirement: Generated artifacts are excluded from change-diff selection

Any dev-flow consumer that derives an action from a list of changed files SHALL exclude
paths marked `linguist-generated` in `.gitattributes` before evaluating its selectors. The
exclusion SHALL be implemented once, in `scripts/filter-generated.sh`, and SHALL derive its
rule from `git check-attr` rather than from a hardcoded path list.

`task freshness:check` is explicitly exempt: there the generated paths are the subject
under test, not noise.

#### Scenario: A change touching only a regenerated artifact selects no website tests

- **GIVEN** a change whose diff contains `components/website/src/data/openspec-status.json` and
  `flux/clusters/fleet/bootstrap/sealed-secrets.yaml`
- **WHEN** `task test:changed` computes its selection
- **THEN** `RUN_E2E_WEBSITE` remains false and Playwright is not started

#### Scenario: A real website source change still selects website tests

- **GIVEN** a change whose diff contains `components/website/src/pages/index.astro`
- **WHEN** `task test:changed` computes its selection
- **THEN** `RUN_WEBSITE` and `RUN_E2E_WEBSITE` are set to true

#### Scenario: The filter passes non-generated paths through unchanged

- **GIVEN** the path list `scripts/foo.sh` and `components/website/src/data/route-manifest.json` on stdin
- **WHEN** `scripts/filter-generated.sh` runs
- **THEN** it emits `scripts/foo.sh` and omits `components/website/src/data/route-manifest.json`

#### Scenario: The filter tolerates empty input

- **GIVEN** empty stdin
- **WHEN** `scripts/filter-generated.sh` runs
- **THEN** it exits 0 and emits nothing

### Requirement: Post-merge deploy does not build container images

`scripts/devflow-post-merge-deploy.sh` SHALL NOT invoke tasks that build and push container
images (`feature:website`, `feature:brett`, `docs:deploy`). Production images are built by
their GitHub Actions workflows and rolled out pull-based via Flux; a local build requires a
registry login the agent does not hold. When such a trigger path is detected, the script
SHALL name the responsible CI workflow instead.

`task feature:deploy` remains available as the break-glass path because `kubectl apply`
requires no registry login. The exit-code collection and fail-closed `deploy/blocked`
reporting introduced by T002242-M3 SHALL remain in effect for the tasks that still run.

#### Scenario: A merged website change reports the CI workflow instead of building

- **GIVEN** a merge commit touching `components/website/src/pages/index.astro`
- **WHEN** `scripts/devflow-post-merge-deploy.sh` runs
- **THEN** no image build is started and the output names `build-website.yml`

#### Scenario: A failing break-glass task still reports deploy blocked

- **GIVEN** `task feature:deploy` exits non-zero
- **WHEN** `scripts/devflow-post-merge-deploy.sh` finishes
- **THEN** it records a `deploy blocked` phase event and exits non-zero

### Requirement: The archive reference describes a reproducible workflow

`.claude/skills/references/plan-archive-steps.md` SHALL prescribe an archive branch name
that satisfies the branch-naming guard in `.githooks/pre-commit`, and SHALL branch the
archive branch from `origin/main` rather than from the already-merged fix branch.

#### Scenario: The prescribed archive branch name passes the pre-commit guard

- **GIVEN** the branch-naming template in `plan-archive-steps.md`
- **WHEN** a slug and a ticket id are substituted
- **THEN** the resulting name matches `T[0-9]{6,}` with an uppercase `T`

#### Scenario: The archive branch is based on origin/main

- **GIVEN** a fix branch that has been squash-merged into `main`
- **WHEN** an agent follows `plan-archive-steps.md` to create the archive branch
- **THEN** the branch is created with `git checkout -B` against `origin/main` and the
  resulting pull request is not `DIRTY`

### Requirement: Worktree limitations of ticket-mcp plan tools are documented

`.claude/skills/references/mcp-tool-guide.md` SHALL record that both
`mcp__ticket-mcp__stage_plan` and `mcp__ticket-mcp__archive_plan` fail when invoked from a
git worktree, because the MCP server resolves plan paths relative to the main checkout, and
SHALL name `scripts/ticket.sh` as the primary path in that situation.

#### Scenario: An agent working in a worktree finds the documented fallback

- **GIVEN** an agent operating inside `.worktrees/<slug>`
- **WHEN** it consults `mcp-tool-guide.md` before archiving a plan
- **THEN** it finds `archive_plan` listed alongside `stage_plan` as worktree-incompatible
  and `bash scripts/ticket.sh archive-plan` named as the path to use

<!-- merged from change delta devflow-selection-archive-hardening.md (898fdd934ab1) -->