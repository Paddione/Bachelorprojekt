# Spec Delta: parallel-partial-plans → dev-flow-plan

## ADDED Requirements

### Requirement: Plan split into tasks.d partials with a mandatory tests partial

The plan skills (`dev-flow-plan` and `opencode-flow-plan`, symmetric) SHALL
split the implementation plan of a change into 1–3 partial plans under
`openspec/changes/<slug>/tasks.d/pX-<name>.md` with pairwise-disjoint
`target_files` lists. `tasks.md` SHALL remain the mandatory index: frontmatter
(F1/F2), the `# <slug> — Implementation Plan` H1, a `## File Structure` section
(union of all partials), a `## Partials` manifest table (partial id, file, role
`impl`|`tests`, disjoint target_files), and the final verify task (STRUCT3).
The LAST partial SHALL always have role `tests` and carry the red→green
failing-test step (`expected: FAIL`). `scripts/plan-lint.sh` SHALL run a
partial mode when `tasks.d/` exists (index checks on `tasks.md`, STRUCT2 checked
in the tests partial, P1/B1a/B1b per partial file, and the new hard rule D1:
no file assigned to two partials); without `tasks.d/` it degrades cleanly to
the current single-plan mode.

#### Scenario: Multi-subsystem change is split into three disjoint partials

- **GIVEN** a change whose `intel.json` impact_files span two subsystems plus tests
- **WHEN** step 3.7(a) decomposes the plan
- **THEN** the orchestrator writes a `## Partials` manifest with three rows, the target_files lists are pairwise disjoint, and the last row has role `tests`

#### Scenario: Duplicate file across partials fails plan-lint

- **GIVEN** a `tasks.d/` index whose manifest assigns the same file to `p1` and `p2`
- **WHEN** `bash scripts/plan-lint.sh openspec/changes/<slug>/tasks.md` runs
- **THEN** the linter reports a `D1` hard fail and exits 1

#### Scenario: Single-plan changes are unaffected

- **GIVEN** a change without a `tasks.d/` directory
- **WHEN** plan-lint runs on its `tasks.md`
- **THEN** the linter behaves exactly as in single-plan mode today

### Requirement: Two-stage plan delegation with minimal per-partial context

Step 3.7 of both plan skills SHALL be two-staged: (a) the orchestrator derives
the partial manifest from `intel.json` (`impact_files`); (b) N plan subagents
run in parallel, each receiving ONLY `proposal.md`, its own manifest entry, the
jq-filtered `intel.json` subset for its target_files (via
`scripts/plan-intel-filter.sh`), and the plan-quality-gates reference. Each
subagent writes its own `tasks.d/pX-<name>.md`; the orchestrator writes the
`tasks.md` index. Branch, worktree, and commit conventions stay unchanged (one
branch, one worktree).

#### Scenario: Partial subagent receives only its filtered intel

- **GIVEN** a partial `p1` with target_files `a.sh` and `b.sh`
- **WHEN** the orchestrator prepares the subagent prompt via `bash scripts/plan-intel-filter.sh <slug> a.sh b.sh`
- **THEN** the injected intel subset contains only impact_files/symbols for `a.sh` and `b.sh` while `meta`, `db_tables`, `api_contracts`, and `risks` pass through verbatim

#### Scenario: Small change degenerates to one partial

- **GIVEN** a change with fewer than five impact_files in a single subsystem
- **WHEN** step 3.7(a) decomposes the plan
- **THEN** exactly one partial is created and it carries the tests role including the failing-test step

### Requirement: design.md is the SSOT location for brainstorm designs

Both plan skills SHALL write the brainstorm design to
`openspec/changes/<slug>/design.md` instead of
`docs/superpowers/specs/<date>-<slug>-design.md` (existing legacy files stay in
place). Dependent tooling SHALL follow: `scripts/vda.sh frontmatter --spec`
accepts the design.md path convention, and `scripts/plan-context.sh` emits an
existing `design.md` and any `tasks.d/*.md` partials as part of the active-plan
context.

#### Scenario: Design lives in the change folder

- **GIVEN** a feature run of dev-flow-plan for slug `example-change`
- **WHEN** the brainstorm design is written
- **THEN** it is created at `openspec/changes/example-change/design.md` and the ticket description references that path

#### Scenario: plan-context emits partials and design

- **GIVEN** an active change with `design.md` and two `tasks.d/` partials
- **WHEN** `bash scripts/plan-context.sh orchestrator` runs
- **THEN** the output contains the proposal, the tasks index, both partial files, and the design content

### Requirement: stage-plan carries the partial count and triggers the embedding index

The stage step SHALL persist the partial count on the ticket for gang gating:
`bash scripts/ticket.sh stage-plan --id <ext_id> --branch <branch> --plan
<path> --partials N` writes `slot_count = N` (validated 1..3, default 1) in the
same staging query, implemented in `scripts/vda/ticket/stage-plan.sh` without
growing `scripts/ticket.sh`. Immediately after staging and before commit/push,
the skills SHALL run `node scripts/openspec-embed.mjs --slug <slug>` so the
change is indexed into pgvector as the embedding-side context transfer for the
execute/factory phase (retrieved via factory-mcp `openspec_find_similar`).

#### Scenario: Staging a three-partial plan sets slot_count

- **GIVEN** a staged change with three partials
- **WHEN** `stage-plan … --partials 3` runs
- **THEN** the ticket row gets `status='plan_staged'` and `slot_count=3` in one query, and `scripts/ticket.sh` itself shows no diff

#### Scenario: Embedding index runs after staging

- **GIVEN** the plan was just staged
- **WHEN** the skill continues to the commit step
- **THEN** `node scripts/openspec-embed.mjs --slug <slug>` has been invoked for the change before the plan commit is pushed
