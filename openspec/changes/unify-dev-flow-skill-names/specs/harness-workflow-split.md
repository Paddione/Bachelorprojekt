## MODIFIED Requirements

### Requirement: opencode has native dev-flow and git-workflow skills

opencode SHALL provide four workflow skill entries under `.opencode/skills/`:
`dev-flow-plan`, `dev-flow-execute`, `dev-flow-chore` (directory symlinks resolving
to the harness-neutral sources `.claude/skills/dev-flow-plan`,
`.claude/skills/dev-flow-execute`, and `.claude/skills/dev-flow-chore`) and
`opencode-git-workflow` (a native file, kept because it carries opencode-specific
git-crypt/worktree glue). Both harnesses SHALL use the same `dev-flow-*` names for
the flow skills; the former `opencode-flow-*` alias names SHALL NOT exist as skill
entries. The shared sources SHALL be harness-neutral: they SHALL NOT contain raw
Claude-only tool syntax (`AskUserQuestion`, `TodoWrite`, `subagent_type`, or the
literal `Task tool`) anywhere in the file, and SHALL carry per-harness dispatch
guidance as clearly labeled matrix entries instead. The symlink mechanism SHALL
follow the established `openspec-*` pattern
(`.opencode/skills/<name> -> ../../.claude/skills/<source>`).

#### Scenario: opencode loads the shared source under its native name

- **GIVEN** an opencode session on a feature request in this repo
- **WHEN** opencode invokes `dev-flow-plan`
- **THEN** the loaded content is byte-identical to `.claude/skills/dev-flow-plan/SKILL.md`
  and delegates sub-work through the labeled harness matrix (`background-agents.ts` /
  `delegate` for opencode, the native subagent dispatch for Claude Code) — never via raw
  `AskUserQuestion`, `TodoWrite`, `subagent_type`, or `Task tool` syntax

#### Scenario: BATS guard confirms symlinks resolve to token-free sources

- **GIVEN** the guard `tests/spec/harness-workflow-split.bats`
- **WHEN** `bats tests/spec/harness-workflow-split.bats` runs
- **THEN** it asserts the three flow-skill entries named `dev-flow-*` are symlinks
  resolving into `.claude/skills/dev-flow-*`, that no `opencode-flow-*` entry remains,
  that `opencode-git-workflow/SKILL.md` is a regular file, that all four resolved
  contents collectively reference `background-agents.ts` and `worktree.ts`, contain none
  of the forbidden tokens, and that the flow skills reference `git-workflow` while
  `opencode-git-workflow` references `scripts/worktree-create.sh`

### Requirement: AGENTS.md declares the shared-source routing

The `## Skill Dispatch Protocol` section of `AGENTS.md` SHALL describe that opencode
loads the same dev-flow sources as Claude Code under the same `dev-flow-*` names
(via directory symlinks), and SHALL NOT instruct agents to avoid the `dev-flow-*`
flow skills or refer to an `opencode-flow-*` alias family. The section SHALL remain
free of raw Claude tool names.

#### Scenario: routing reflects the shared source

- **GIVEN** `AGENTS.md`
- **WHEN** the `## Skill Dispatch Protocol` section is extracted
- **THEN** it states that opencode loads the `dev-flow-*` sources under identical names
  and contains none of `AskUserQuestion`, `TodoWrite`, `subagent_type`, `Task tool`
