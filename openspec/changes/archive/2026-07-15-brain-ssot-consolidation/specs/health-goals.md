## ADDED Requirements

### Requirement: REQ-HEALTH-GOALS-001 — Single Source of Truth in goals.md

`.claude/lib/goals.md` SHALL be the sole authored source of truth for repository health goals. Every
consumer of goal data — the website dashboard (Homepage `#health` section, `/admin/repohealth`) and the
brain wiki — SHALL derive its content from `.claude/lib/goals.md`, either directly (brain ingest) or via
a generated artifact (website), never from a second hand-maintained copy of goal definitions.

#### Scenario: The website never hand-maintains a duplicate goal list

- **GIVEN** `website/src/lib/goals-data.ts`
- **WHEN** its source is inspected
- **THEN** it imports goal data from a generated JSON artifact rather than declaring goal entries as a
  literal in-source array

### Requirement: REQ-HEALTH-GOALS-002 — Generated Website Artifact

A generator script (`scripts/gen-goals-data.mjs`) SHALL parse `.claude/lib/goals.md` and emit
`website/src/lib/goals-data.generated.json`, an array of objects matching the `HealthGoal` TypeScript
interface (`id`, `title`, `category`, `priority`, `direction`, `baseline`, `current`, `target`, `unit`,
`status`, `measurement`, `source`, `measured_at`, optional `note`). The generator SHALL parse both goal
representations present in `goals.md`: individual `## G-<id> — <title>` sections carrying a
`**<priority> · Baseline:** … · **Target:** …` meta blockquote line (Priority A/B), and Markdown table
rows in the Green-Gates section (Priority C). Every emitted entry's `source` field SHALL read
`.claude/lib/goals.md · <id>`.

#### Scenario: An H2-section goal is parsed into the HealthGoal shape

- **GIVEN** a `## G-<id> — <title>` section in `.claude/lib/goals.md` with a well-formed meta
  blockquote line
- **WHEN** `scripts/gen-goals-data.mjs` runs
- **THEN** the generated JSON contains an entry with that `id`, correctly parsed `baseline`, `current`,
  and `target` numbers, and a `source` of `.claude/lib/goals.md · <id>`

#### Scenario: A Green-Gates table row is parsed into the HealthGoal shape

- **GIVEN** a Markdown table row in the Priority-C Green-Gates section of `.claude/lib/goals.md`
- **WHEN** `scripts/gen-goals-data.mjs` runs
- **THEN** the generated JSON contains an entry with that row's `id`, `priority: "C"`, and a `null`
  `baseline` (the table has no baseline column)

### Requirement: REQ-HEALTH-GOALS-003 — Freshness Gate

`website/src/lib/goals-data.generated.json` SHALL be a freshness-gated generated artifact: a
`health:goals:emit` Taskfile target SHALL run the generator, `task freshness:regenerate` SHALL include
that target, and `task freshness:check` SHALL fail if the committed
`website/src/lib/goals-data.generated.json` differs from a fresh regeneration.

#### Scenario: A stale generated goals JSON fails freshness:check

- **GIVEN** `.claude/lib/goals.md` was edited but `website/src/lib/goals-data.generated.json` was not
  regenerated and committed
- **WHEN** `task freshness:check` runs
- **THEN** it fails and names `website/src/lib/goals-data.generated.json` as stale

### Requirement: REQ-HEALTH-GOALS-004 — Fail-Loud Parsing

`scripts/gen-goals-data.mjs` SHALL exit non-zero and name the offending goal ID on stderr when it
encounters a structurally broken entry: a `## G-<id> — …` heading with no following meta blockquote
line before the next heading, a meta blockquote line whose `Baseline:` or `Target:` field contains no
digits and is not the literal token `n/a`, or a Green-Gates table row whose ID column does not match
`G-[A-Z0-9-]+`. Free-text baseline/target annotations that still contain extractable numbers (e.g.
`"3 (dev-flow-execute 662, infra-ops 595, …) → 1 (dev-flow-plan 508)"`) SHALL be tolerated via
first-number/last-number extraction rather than rejected.

#### Scenario: A goal section missing its meta-line fails the generator

- **GIVEN** a `## G-<id> — …` heading under a Priority A/B section with no meta blockquote line before
  the next heading
- **WHEN** `scripts/gen-goals-data.mjs` runs
- **THEN** it exits non-zero
- **AND** its stderr output names the offending `<id>`

#### Scenario: A messy but numeric baseline annotation is tolerated

- **GIVEN** a meta blockquote line whose `Baseline:` field is free text containing at least one number
- **WHEN** `scripts/gen-goals-data.mjs` runs
- **THEN** it exits `0` and extracts the first number found as the `baseline` value
