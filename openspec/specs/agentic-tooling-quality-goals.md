# agentic-tooling-quality-goals

## Purpose

SSOT spec.

## Requirements

### Requirement: G-AGENTIC01 Subagent Tool-Scope Baseline Tracked

The measurement command SHALL count how many of `bachelorprojekt-security`, `bachelorprojekt-infra`,
and `bachelorprojekt-db` lack an explicit `tools:` frontmatter field. This is a Target, not a Gate —
the count is documented in `goals.md` without failing CI regardless of value.

#### Scenario: Counting unscoped high-risk agents

- **GIVEN** the three agent files `bachelorprojekt-security.md`, `bachelorprojekt-infra.md`,
  `bachelorprojekt-db.md` under `.claude/agents/`
- **WHEN** the G-AGENTIC01 measure command is executed
- **THEN** it prints the exact count of those files missing a `tools:` field, and that value is
  recorded as the documented Target baseline in `goals.md`

### Requirement: G-AGENTIC02 Subagent Routing Table Drift Gate

For every one of the 6 custom subagents, the trigger-word list in `AGENTS.md`'s routing table SHALL
match the corresponding agent's frontmatter `description:` trigger tokens exactly.

#### Scenario: No drift after correcting AGENTS.md

- **GIVEN** `AGENTS.md` and the 6 `.claude/agents/*.md` files
- **WHEN** the G-AGENTIC02 measure command compares each agent's trigger tokens between its
  frontmatter description and its `AGENTS.md` table row
- **THEN** the count of mismatches is 0

### Requirement: G-AGENTIC03 Subagent Frontmatter Completeness Gate

Every `.claude/agents/*.md` file SHALL declare non-empty `name:` and `description:` fields, and
`name:` SHALL equal the file's basename (without extension).

#### Scenario: All agent files pass frontmatter completeness

- **GIVEN** all files under `.claude/agents/*.md`
- **WHEN** the G-AGENTIC03 measure command scans each file's frontmatter block
- **THEN** zero files are missing `name:`/`description:` or have a `name:` value that does not match
  their filename

### Requirement: G-AGENTIC04 Agent-Library Test Reachable From CI Change-Detection

`Taskfile.yml`'s `test:changed` smart-selection SHALL trigger `tests/spec/agent-library.bats`
whenever a diff touches `.claude/agents/**/*.md` or `AGENTS.md`.

#### Scenario: Agent-only diff triggers the library test

- **GIVEN** a git diff that only touches `.claude/agents/bachelorprojekt-ops.md`
- **WHEN** `task test:changed`'s file-bucket regex is evaluated against that diff
- **THEN** the bucket matches and `tests/spec/agent-library.bats` is included in the resulting test run

### Requirement: G-AGENTIC05 Six-Agent List Cross-Reference Gate

The set of agent basenames under `.claude/agents/*.md` SHALL equal the `ROUTING_AGENTS` set in
`scripts/code-quality/validate.mjs` and the `agent-*` IDs in `docs/agent-guide/registry/tools.yaml`
(prefix-normalized).

#### Scenario: All three representations agree

- **GIVEN** the three representations of the 6-agent list (files, `ROUTING_AGENTS`, registry IDs)
- **WHEN** the G-AGENTIC05 measure command diffs them pairwise
- **THEN** all pairwise diffs are empty

### Requirement: G-AGENTIC06 Skill Inventory Count Matches OVERVIEW.md Gate

`.claude/skills/OVERVIEW.md`'s claimed skill count SHALL equal the actual count of
`find .claude/skills -name SKILL.md`.

#### Scenario: Claimed count matches real count after correction

- **GIVEN** `OVERVIEW.md` and the real `.claude/skills/` tree
- **WHEN** the G-AGENTIC06 measure command extracts the claimed count from `OVERVIEW.md` and the real
  count via `find`
- **THEN** both counts are equal

### Requirement: G-AGENTIC07 No Orphaned Skills Gate

Every active (non-archived) skill directory under `.claude/skills/` SHALL be referenced by at least
one of `CLAUDE.md`, `AGENTS.md`, `OVERVIEW.md`, or another skill's `SKILL.md`.

#### Scenario: Every active skill has at least one reference

- **GIVEN** the list of active (non-archived) skill directories
- **WHEN** the G-AGENTIC07 measure command searches for each skill's directory name across
  `CLAUDE.md`, `AGENTS.md`, `OVERVIEW.md`, and all other `SKILL.md` files
- **THEN** the count of skills with zero references is 0

### Requirement: G-AGENTIC08 No Dead Script/Task References In Skills Gate

Every `scripts/*.sh|.mjs|.py` path and `task <name>` reference mentioned inside a `SKILL.md` file
SHALL correspond to a file that exists on disk / a task that is defined in `Taskfile.yml`.

#### Scenario: All referenced scripts exist

- **GIVEN** all `.claude/skills/**/SKILL.md` files
- **WHEN** the G-AGENTIC08 measure command extracts every referenced script path and checks each with
  `test -f`
- **THEN** the count of missing files is 0

### Requirement: G-AGENTIC09 God-Skill Line Budget Tracked

The count of `SKILL.md` files exceeding 500 lines SHALL be measured and documented as a Target
baseline in `goals.md`, without a forced split and without failing CI.

#### Scenario: Counting oversized skills

- **GIVEN** all `.claude/skills/*/SKILL.md` files
- **WHEN** the G-AGENTIC09 measure command counts lines per file
- **THEN** the count of files exceeding 500 lines is recorded as the documented Target baseline

### Requirement: G-AGENTIC10 Agent Skill-Dispatch Backreference Tracked

For each of the 6 custom subagents, whether at least one skill declares an `agent:` frontmatter field
pointing to it SHALL be measured and documented as a Target baseline.

#### Scenario: Counting agents without a dispatching skill

- **GIVEN** the 6 agent names and all `SKILL.md` files
- **WHEN** the G-AGENTIC10 measure command checks for an `agent: <name>` field per agent name
- **THEN** the count of agents with zero referring skills is recorded as the documented Target baseline

### Requirement: G-AGENTIC11 CLAUDE.md MCP Server List Accuracy Gate

`CLAUDE.md`'s stated list of opencode-registered MCP servers SHALL equal the actual server names
registered in `.opencode/opencode.jsonc`.

#### Scenario: No phantom or undocumented servers after correction

- **GIVEN** `CLAUDE.md`'s opencode MCP server sentence and the real `.opencode/opencode.jsonc` server
  keys
- **WHEN** the G-AGENTIC11 measure command diffs the two sets
- **THEN** the combined count of phantom (claimed-but-absent) and undocumented (present-but-unclaimed)
  servers is 0

### Requirement: G-AGENTIC12 MCP Tool Guide Server Coverage Gate

Every MCP server registered in `.mcp.json` SHALL have a corresponding documented section in
`.claude/skills/references/mcp-tool-guide.md`.

#### Scenario: Every registered server is documented

- **GIVEN** the server names in `.mcp.json` and the sections in `mcp-tool-guide.md`
- **WHEN** the G-AGENTIC12 measure command checks each server name for a mention in the guide
- **THEN** the count of undocumented servers is 0

### Requirement: G-AGENTIC13 No Dead MCP Server References In Skills Gate

Every `mcp__<server>__*` tool token referenced inside a `SKILL.md` file SHALL correspond to a server
actually registered in `.mcp.json` or `.opencode/opencode.jsonc`.

#### Scenario: No dead server references after correction

- **GIVEN** all `SKILL.md` files and the registered server names
- **WHEN** the G-AGENTIC13 measure command extracts referenced `mcp__<server>__*` tokens and checks
  each against the registered server set
- **THEN** the count of dead references is 0

### Requirement: G-AGENTIC14 MCP Config Parity Gate

For every server present in both `.mcp.json` and `.opencode/opencode.jsonc`, the URL or command path
SHALL match between the two files.

#### Scenario: Config parity holds

- **GIVEN** a server registered in both config files
- **WHEN** the G-AGENTIC14 measure command compares the URL/command path for that server across both
  files
- **THEN** the count of mismatches is 0

### Requirement: G-AGENTIC15 No Phantom Command References Gate

Every `/opsx:*` or `/opsx-*` command token referenced inside `CLAUDE.md`, `AGENTS.md`, a command file,
or a `SKILL.md` SHALL correspond to an actually existing command file.

#### Scenario: No phantom command references after correction

- **GIVEN** all referenced `/opsx:*`/`/opsx-*` tokens across `CLAUDE.md`, `AGENTS.md`,
  `.claude/commands/**`, `.opencode/commands/**`, and `SKILL.md` files
- **WHEN** the G-AGENTIC15 measure command checks each token against the existing command filenames
- **THEN** the count of phantom references is 0

### Requirement: G-AGENTIC16 Claude-Code / opencode Command Sync Gate

For each `opsx` command, the body content of `.claude/commands/opsx/<name>.md` SHALL match
`.opencode/commands/opsx-<name>.md` after stripping frontmatter and normalizing the `/opsx:`/`/opsx-`
naming convention.

#### Scenario: Command pairs stay in sync

- **GIVEN** the propose/apply/archive/explore command pairs
- **WHEN** the G-AGENTIC16 measure command diffs each normalized pair
- **THEN** the count of non-trivial diffs is 0

### Requirement: G-AGENTIC17 Command S4-Orphan Gate Coverage Gate

`docs/code-quality/gates.yaml`'s S4 orphan-scan scope SHALL include `.claude/commands/**/*.md` and
`.opencode/commands/**/*.md` as candidates, with `CLAUDE.md`, `AGENTS.md`, and `SKILL.md` files as
reference sources.

#### Scenario: No orphaned command files after scope extension

- **GIVEN** the extended S4 gate configuration in `docs/code-quality/gates.yaml`
- **WHEN** `node scripts/code-quality/gates/s4-orphans.mjs` is run
- **THEN** it reports 0 orphaned command files

## Acceptance Criteria

- THEN `bash scripts/health-goals-check.sh --only=G-AGENTIC02,G-AGENTIC03,G-AGENTIC04,G-AGENTIC05,G-AGENTIC06,G-AGENTIC07,G-AGENTIC08,G-AGENTIC11,G-AGENTIC12,G-AGENTIC13,G-AGENTIC14,G-AGENTIC15,G-AGENTIC16,G-AGENTIC17` exits 0 (all 14 Gates green)
- THEN `bash scripts/health-goals-check.sh --only=G-AGENTIC01,G-AGENTIC09,G-AGENTIC10` prints the documented Target baselines without a non-zero exit code
- THEN `task test:changed`, `task freshness:regenerate`, and `task freshness:check` all pass
- THEN `node scripts/code-quality/gates/s4-orphans.mjs` reports 0 orphaned command files

<!-- merged from change delta agentic-tooling-quality-goals.md on 2026-07-01 -->