# dev-flow-plan

## Purpose

Der `dev-flow-plan`-Skill orchestriert den Plan-Lifecycle im Software-Factory-Kreislauf:
vom Triage-Ticket über Brainstorming und Spec-Erstellung bis zum gestageten Plan, der
anschließend von `dev-flow-execute` umgesetzt wird. Diese SSOT-Spec dokumentiert die
harten Anforderungen an Subagent-Prompts, Change-Seeds und Ticket-CLI-Operationen, die
sicherstellen, dass der Plan-Lint-Gate schon beim ersten Anlauf PASS liefert und die
Cluster-Schreibpfade offline-safe sind.

## Requirements

<!-- merged from change delta dev-flow-plan.md on 2026-06-27 -->
# Spec Delta: dev-flow-plan-ticket-sh-mishaps

### Requirement: dev-flow-plan Step 3.7 prompt enumerates plan-lint hard rules

The Step 3.7 subagent-prompt block in
`.agents/skills/dev-flow-plan/SKILL.md` MUST list the plan-lint hard rules
(F1 frontmatter keys, F2 non-empty domains, STRUCT1 plan shape, STRUCT2
failing-test step, STRUCT3 verify-task gates, P1 placeholder ban) in a
dedicated "plan-lint Hard Rules (PFLICHT)" sub-section so a fresh subagent
reading only the prompt produces a plan that passes
`bash scripts/plan-lint.sh` on the first try.

#### Scenario: Step 3.7 prompt mentions all four F1 frontmatter keys

- **GIVEN** the Step 3.7 subagent-prompt block in
  `.agents/skills/dev-flow-plan/SKILL.md`
- **WHEN** the block is sliced (from `### Schritt 3.7` to the next
  `## ` or `### ` header)
- **THEN** the sliced block MUST contain the words `title`, `ticket_id`,
  `domains`, and `status` in the context of the frontmatter rules

#### Scenario: Step 3.7 prompt requires the File Structure section and the expected: FAIL phrase

- **GIVEN** the Step 3.7 subagent-prompt block in
  `.agents/skills/dev-flow-plan/SKILL.md`
- **WHEN** the block is sliced as in the previous scenario
- **THEN** the block MUST contain the phrase `File Structure`
- **AND** MUST contain the phrase `expected: FAIL` (or its regex-tolerant
  form `expected:? *fail`)

#### Scenario: Step 3.7 prompt lists the three mandatory verify-task commands

- **GIVEN** the Step 3.7 subagent-prompt block
- **THEN** the block MUST contain the three lines
  `task test:changed`, `task freshness:regenerate`, and
  `task freshness:check` (each matching the regex
  `task[[:space:]]+<cmd>`)

#### Scenario: Step 3.7 prompt warns against TBD/TODO/FIXME placeholders in plan prose

- **GIVEN** the Step 3.7 subagent-prompt block
- **THEN** the block MUST mention at least one of the placeholder tokens
  `TBD`, `TODO`, or `FIXME` in the context of the P1 placeholder ban

### Requirement: openspec.sh propose seeds a plan-lint-PASS tasks.md skeleton

`scripts/openspec.sh propose <slug> --ticket <ext-id>` MUST seed
`openspec/changes/<slug>/tasks.md` with a skeleton that already passes
`bash scripts/plan-lint.sh`. The skeleton MUST contain:

- YAML frontmatter with the four F1 keys (`title`, `ticket_id`, `domains`,
  `status`); `domains` MUST be a non-empty list (F2).
- A H1 header matching the regex `^# .* Implementation Plan` (STRUCT1).
- A `## File Structure` H2 section (STRUCT1).
- At least one task that contains a failing-test step with the phrase
  `expected: FAIL` (or its regex-tolerant form `expected:? *fail`)
  (STRUCT2).
- A verify task that lists the three mandatory CI gates
  `task test:changed`, `task freshness:regenerate`,
  `task freshness:check` (STRUCT3).

#### Scenario: fresh change folder passes plan-lint end-to-end

- **GIVEN** a clean `OPENSPEC_ROOT` (no existing `changes/<slug>/`)
- **WHEN** `bash scripts/openspec.sh propose fixture --ticket T000099` is
  run with `TICKET_OFFLINE=1`
- **THEN** the produced `tasks.md` MUST exist
- **AND** `bash scripts/plan-lint.sh <OPENSPEC_ROOT>/changes/fixture/tasks.md`
  MUST exit 0 (PASS, zero hard fails)

### Requirement: scripts/ticket.sh cluster-write subcommands respect TICKET_OFFLINE=1

`scripts/ticket.sh` MUST honour the `TICKET_OFFLINE=1` environment
variable in the same way `scripts/openspec.sh` does. The following
cluster-write subcommands MUST emit an `OFFLINE: skipped <op> …` marker
on stdout and exit 0 when `TICKET_OFFLINE=1` is set:

- `archive-plan`
- `phase`
- `set-touched-files`
- `set-pipeline-slot`
- `set-scout-drift`
- `update-status`
- `add-comment`
- `add-pr-link`
- `inject`

The read subcommands (`get`, `get-attachments`, `list`,
`get-injections`, `retry-count`) MUST NOT be silently skipped — they must
continue to fail loudly in `TICKET_OFFLINE=1` mode (either with a
non-zero exit or with an explicit `OFFLINE` marker on PASS), so that the
dev-flow-execute read-fallback chain still surfaces a missing cluster.

#### Scenario: cluster-write subcommand is skipped under TICKET_OFFLINE=1

- **GIVEN** `TICKET_OFFLINE=1` is set
- **WHEN** any of the nine cluster-write subcommands is invoked with
  valid arguments
- **THEN** the command MUST exit 0
- **AND** the stdout MUST contain the string `OFFLINE`

#### Scenario: read subcommand still requires the cluster in OFFLINE mode

- **GIVEN** `TICKET_OFFLINE=1` is set
- **WHEN** `ticket.sh get --id T000001` is invoked
- **THEN** the command MUST NOT exit 0 silently with the live cluster
  data (no silent cluster skip)
- **AND** it MUST either exit non-zero OR exit 0 with an explicit
  `OFFLINE` marker in stdout

### Requirement: BATS test coverage for the mishap bundle

A BATS test file `tests/spec/dev-flow-plan-ticket-sh-mishaps.bats` MUST
exist with at least 28 test cases (10 for M1, 8 for M2, 10 for M3) that
verify all three requirements above. The suite MUST be hermetic: it
MUST use `TICKET_OFFLINE=1` and an isolated `OPENSPEC_ROOT=<tmpdir>` so
that no live cluster is touched and no real change folder is polluted.

#### Scenario: suite fails red on the pre-fix branch

- **GIVEN** the BATS file exists
- **AND** the dev-flow-plan skill, the `openspec.sh` propose seeder, and
  the `ticket.sh` cluster-write subcommands are still in their pre-fix
  state
- **WHEN** the suite is run
- **THEN** at least 24 of the 28 cases MUST fail (PASS/FAIL red)

#### Scenario: suite passes green after the three fixes

- **GIVEN** the BATS file exists
- **AND** all three fixes (Step 3.7 prompt, openspec.sh propose seed,
  ticket.sh OFFLINE guards) have landed
- **WHEN** the suite is run
- **THEN** all 28 cases MUST pass

### Requirement: plan-context.sh filters by role

The `scripts/plan-context.sh <role> [--with-openspec …]` script MUST filter
the emitted active OpenSpec change proposals to those whose `proposal.md`
frontmatter `domains:` list intersects with the domain-allowlist of the
supplied `<role>`. The role-to-domain mapping is a hardcoded lookup in
the script that mirrors the Agent Routing table in `AGENTS.md`
(lines 7-18). Proposals without a `domains:` frontmatter are included
as a legacy fallback and emit a `WARN:` line on stderr. Proposals with
`domains: []` (explicitly empty) are excluded for every role. The
special value `role=orchestrator` (or empty `<role>`) returns every
non-archived proposal (escape hatch for cross-cutting requests). An
unknown role returns every non-archived proposal plus a `WARN: unknown
role "<name>"` line on stderr.

#### Scenario: role=ops includes ops-tagged proposals and excludes website-tagged

- **GIVEN** at least one proposal with `domains: [ops, llm]` and one
  with `domains: [website]`
- **WHEN** `bash scripts/plan-context.sh bachelorprojekt-ops` is run
- **THEN** the output contains the ops-tagged proposal
- **AND** the output does not contain the website-tagged proposal

#### Scenario: legacy proposals without `domains:` frontmatter are included with a stderr WARN

- **GIVEN** a proposal without a `domains:` frontmatter field
- **WHEN** `bash scripts/plan-context.sh <any-known-role>` is run
- **THEN** the output contains the legacy proposal
- **AND** stderr contains a line matching
  `WARN: legacy proposal without domains frontmatter: <slug>`

#### Scenario: proposals with `domains: []` are excluded for all roles

- **GIVEN** a proposal with `domains: []` (explicitly empty)
- **WHEN** `bash scripts/plan-context.sh <any-known-role>` is run
- **THEN** the output does not contain the proposal

#### Scenario: role=orchestrator returns all non-archived proposals

- **GIVEN** any number of non-archived proposals
- **WHEN** `bash scripts/plan-context.sh orchestrator` is run
- **THEN** the output contains every non-archived proposal
- **AND** proposals under `openspec/changes/archive/` are still
  excluded

#### Scenario: unknown role returns all proposals plus a stderr WARN

- **GIVEN** a `<role>` that is not in the script's role-to-domain
  lookup
- **WHEN** `bash scripts/plan-context.sh foobar` is run
- **THEN** the output contains every non-archived proposal
- **AND** stderr contains a line matching
  `WARN: unknown role "foobar"`

<!-- merged from change delta dev-flow-plan.md on 2026-07-01 -->

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
the skills SHALL run `bash scripts/openspec-embed-local.sh <slug> "$(pwd)"`
(the fail-visible wrapper — not the bare `openspec-embed.mjs`, which skips
silently on missing env) so the change is indexed into pgvector as the
embedding-side context transfer for the execute/factory phase (retrieved via
factory-mcp `openspec_find_similar`).

#### Scenario: Staging a three-partial plan sets slot_count

- **GIVEN** a staged change with three partials
- **WHEN** `stage-plan … --partials 3` runs
- **THEN** the ticket row gets `status='plan_staged'` and `slot_count=3` in one query, and `scripts/ticket.sh` itself shows no diff

#### Scenario: Embedding index runs after staging

- **GIVEN** the plan was just staged
- **WHEN** the skill continues to the commit step
- **THEN** `bash scripts/openspec-embed-local.sh <slug> "$(pwd)"` has been invoked for the change before the plan commit is pushed

<!-- merged from change delta dev-flow-plan.md (2c84896a552a) -->

### Requirement: plan-lint honours the S1 ignore list

`scripts/plan-lint.sh` SHALL read both `s1.limits` and `s1.ignore` from
`docs/code-quality/gates.yaml`. For a file matching an `s1.ignore` entry,
`residual_budget` SHALL return an empty value, so that neither the B1a budget-integrity
check nor the B1b split/shrink check applies to it. Matching SHALL treat entries as
repo-relative glob patterns, so that a directory pattern covers the files beneath it.

#### Scenario: An ignored file yields no budget

- **GIVEN** `scripts/ticket.sh` is listed under `s1.ignore` and exceeds the `.sh` limit
- **WHEN** `residual_budget scripts/ticket.sh` is evaluated
- **THEN** the result is empty rather than a negative number

#### Scenario: No split is demanded for an ignored file

- **GIVEN** a plan whose File Structure lists `scripts/ticket.sh` and which contains no
  split or shrink step
- **WHEN** `scripts/plan-lint.sh` runs against it
- **THEN** the run exits 0 and emits no `B1b` finding

#### Scenario: A gated file is unaffected

- **GIVEN** a file that is not on the ignore list and sits above its effective threshold
- **WHEN** `scripts/plan-lint.sh` runs against a plan touching it without a split step
- **THEN** the `B1b` warning is still emitted

### Requirement: Budget claims on ignored files are flagged

When a plan states a numeric budget for a file that `s1.ignore` covers,
`scripts/plan-lint.sh` SHALL emit a `W4` warning naming the file and explaining that the
S1 gate does not measure it. The warning SHALL NOT change the exit code.

#### Scenario: A numeric budget on an ignored file warns without failing

- **GIVEN** a plan row stating both a line count and a numeric budget for an ignored file
- **WHEN** `scripts/plan-lint.sh` runs against it
- **THEN** a `W4` warning names that file
- **AND** the run still exits 0

#### Scenario: Omitting the budget on an ignored file is silent

- **GIVEN** a plan row that states no numeric budget for an ignored file
- **WHEN** `scripts/plan-lint.sh` runs against it
- **THEN** no `W4`, `B1a` or `B1b` finding mentions that file

<!-- merged from change delta dev-flow-plan.md (4d8ba6b1c7c2) -->

### Requirement: Intel bundle risks are deduplicated across regenerations

The intel bundle generator (`scripts/plan-intel.sh`) SHALL deduplicate the `risks[]` array by
the `(note, severity)` pair when it merges the previous bundle's risks into a freshly generated
one, so that repeated runs against the same change directory do not accumulate identical
entries.

#### Scenario: Repeated generator runs do not accumulate identical risks

- **GIVEN** a change directory whose `intel.json` was already generated
- **WHEN** the generator is run two more times against the same change directory
- **THEN** the resulting `risks[]` SHALL contain exactly one entry per distinct
  `(note, severity)` pair
- **AND** `intel.json` SHALL be byte-identical between the second and the third run

#### Scenario: A manually added risk survives regeneration

- **GIVEN** an `intel.json` whose `risks[]` contains an entry with a `note` the generator does
  not produce
- **WHEN** the generator is run again
- **THEN** that entry SHALL still be present exactly once in the regenerated `risks[]`

#### Scenario: Manually curated sections stay unaffected

- **GIVEN** an `intel.json` carrying `api_contracts` entries
- **WHEN** the generator is run again
- **THEN** those entries SHALL survive the run unchanged, preserving the existing behaviour for
  `api_contracts` and `external_types`

<!-- merged from change delta dev-flow-plan.md (4d352ce7189e) -->

### Requirement: Plan context is summarized per proposal

`scripts/plan-context.sh` SHALL emit, for each proposal that passes the role filter, a summary
consisting of the slug, the title, the short description from `proposal.md` and the task
headings from `tasks.md`. It SHALL NOT emit the complete body of `proposal.md`, `tasks.md`,
`tasks.d/*.md` or `design.md` by default.

The complete body SHALL remain reachable via an explicit `--full` flag, so that no existing
consumer loses access to information it relies on.

A proposal whose `domains:` field cannot be resolved from either `proposal.md` or its adjacent
`tasks.md` SHALL be excluded from every role-filtered run, rather than included for all roles.
The orchestrator role and the unknown-role fail-soft path keep their current behaviour.

The rationale is a budget, not aesthetics: CLAUDE.md requires this output to be prepended to
every agent dispatch. At five-figure line counts the step gets skipped in practice, which
removes the context injection entirely.

#### Scenario: a selected proposal contributes a summary, not its body

- **GIVEN** a proposal tagged `domains: [ops]` whose `tasks.md` contains 200 detail lines
- **WHEN** `bash scripts/plan-context.sh bachelorprojekt-ops` runs
- **THEN** the output names the proposal and its task headings, and contains none of the 200
  detail lines

#### Scenario: --full restores the complete body

- **GIVEN** the same proposal
- **WHEN** `bash scripts/plan-context.sh bachelorprojekt-ops --full` runs
- **THEN** the output contains the complete `tasks.md` body, as before this change

#### Scenario: an unmarked proposal is excluded from a role-filtered run

- **GIVEN** a proposal with no resolvable `domains:` field in `proposal.md` or `tasks.md`
- **WHEN** `bash scripts/plan-context.sh bachelorprojekt-db` runs
- **THEN** the proposal does not appear in the output, and a WARN naming the slug goes to stderr

#### Scenario: the orchestrator role still sees every proposal

- **GIVEN** the same unmarked proposal
- **WHEN** `bash scripts/plan-context.sh orchestrator` runs
- **THEN** the proposal appears, because `__ALL__` disables filtering entirely

<!-- merged from change delta dev-flow-plan.md (08af93de5962) -->