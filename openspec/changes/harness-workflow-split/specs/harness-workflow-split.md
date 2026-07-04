## ADDED Requirements

### Requirement: opencode has native dev-flow and git-workflow skills

opencode SHALL provide four native skills under `.opencode/skills/` —
`opencode-flow-plan`, `opencode-flow-execute`, `opencode-flow-chore`, and
`opencode-git-workflow` — that mirror the workflow of their Claude counterparts
(`dev-flow-plan`/`-execute`/`-chore`, `git-workflow`) but are built on opencode's
own orchestration primitives (`background-agents.ts` for delegation, `worktree.ts`
plus the git-crypt-safe `scripts/worktree-create.sh` for isolation). These skills
SHALL NOT contain Claude-only tool references (`AskUserQuestion`, `TodoWrite`,
`subagent_type`, or the `Task tool` delegation primitive).

#### Scenario: opencode drives a plan without Claude-only tools

- **GIVEN** an opencode session on a feature request in this repo
- **WHEN** opencode invokes `opencode-flow-plan`
- **THEN** the skill delegates sub-work through `background-agents.ts` (`delegate`
  for read-only sub-agents, native write-capable delegation otherwise) and asks the
  user with plain-text questions — never `AskUserQuestion`, `TodoWrite`, or `Task tool`

#### Scenario: BATS guard confirms the four skills exist and are Claude-tool-free

- **GIVEN** the guard `tests/spec/harness-workflow-split.bats`
- **WHEN** `bats tests/spec/harness-workflow-split.bats` runs
- **THEN** it asserts all four `.opencode/skills/opencode-*/SKILL.md` files exist,
  collectively reference `background-agents.ts` and `worktree.ts`, and contain none
  of `AskUserQuestion`, `TodoWrite`, `subagent_type`, `Task tool`

### Requirement: shared openspec-* skills are harness-neutral

The four shared skills `.claude/skills/openspec-{propose,apply-change,archive-change,explore}/SKILL.md`
(symlinked into `.opencode/skills/`) SHALL contain no Claude-only tool syntax, while
still retaining an executable delegation instruction so no capability is silently
dropped. The symlink mechanism SHALL remain unchanged.

#### Scenario: cleaned skills keep a delegation instruction

- **GIVEN** `openspec-archive-change/SKILL.md` after cleanup
- **WHEN** the spec-sync step is reached
- **THEN** the file still instructs the harness to invoke the `openspec-sync-specs`
  skill (with an inline fallback), but no longer names `Task tool` or `subagent_type`

#### Scenario: BATS guard confirms tokens removed

- **GIVEN** the guard `tests/spec/harness-workflow-split.bats`
- **WHEN** it greps the four `openspec-*` SKILL.md files
- **THEN** none contain `AskUserQuestion`, `TodoWrite`, `subagent_type`, or `Task tool`,
  and `openspec-archive-change/SKILL.md` still contains `openspec-sync-specs`

### Requirement: AGENTS.md declares an opencode-native dispatch protocol

The `## Skill Dispatch Protocol` section of `AGENTS.md` (opencode's loaded
instructions file) SHALL describe subagent dispatch via the `background-agents.ts`
plugin (`delegate`/`delegation_read`) and SHALL NOT contain Claude tool names.
The shared agent-routing table SHALL remain unchanged.

#### Scenario: dispatch section is opencode-native

- **GIVEN** `AGENTS.md`
- **WHEN** the `## Skill Dispatch Protocol` section is extracted
- **THEN** it references `background-agents.ts` and `delegate`, and contains none of
  `AskUserQuestion`, `TodoWrite`, `subagent_type`, `Task tool`

### Requirement: the tool registry records a harness per entry

`docs/agent-guide/registry/tools.yaml` SHALL carry a `harness` field with a value in
`{claude, opencode, both}` on every entry, validated by `scripts/agent-guide/validate.mjs`.
`scripts/agent-guide/emit-maps.mjs` SHALL render a `Harness` column in
`docs/agent-guide/maps/tools-map.md`.

#### Scenario: validate rejects a missing or invalid harness

- **GIVEN** a registry fixture whose tool entry has an invalid `harness` value
- **WHEN** `validateRegistry(dir)` runs
- **THEN** it returns `ok: false` with an error mentioning `harness`

#### Scenario: tools-map renders the Harness column

- **GIVEN** the regenerated `docs/agent-guide/maps/tools-map.md`
- **WHEN** it is read
- **THEN** each tool table header carries a `Harness` column and every row shows
  `claude`, `opencode`, or `both`

### Requirement: the openspec-* cleanup preserves the Antigravity path

A BATS guard SHALL verify that cleaning the shared `openspec-*` skills does not break
their use by a Claude-Code instance running under `~/.gemini/antigravity-cli/` (which
inherits `.claude/skills/` directly). The guard SHALL skip gracefully when the
antigravity CLI is absent, keeping CI green on machines without it.

#### Scenario: Antigravity inherits the cleaned skills

- **GIVEN** the repo `.claude/skills/openspec-*/SKILL.md` files (which Antigravity reads directly)
- **WHEN** the guard runs on a host with the antigravity CLI installed
- **THEN** no `~/.gemini/antigravity-cli/**/openspec-*/SKILL.md` copy shadows the repo
  files with reintroduced Claude-only tokens; when the CLI is absent the test skips

### Requirement: opencode worktree isolation stays git-crypt-safe

Because `.opencode/plugins/worktree.ts` runs `git worktree add` with checkout and does
not neutralize the git-crypt smudge filter (unlike `scripts/worktree-create.sh`), the
`opencode-git-workflow` skill SHALL create worktrees via the git-crypt-safe
`scripts/worktree-create.sh` and document the `worktree.ts` limitation, so encrypted
paths under `environments/.secrets/**` neither fail checkout nor leak encrypted-at-rest
content with a stale smudge filter.

#### Scenario: opencode worktree creation on a git-crypt repo is safe

- **GIVEN** the `opencode-git-workflow` skill
- **WHEN** it prepares an isolated worktree for a branch touching git-crypt-managed paths
- **THEN** it uses `scripts/worktree-create.sh` (which copies/neutralizes the git-crypt
  filter) rather than a bare `worktree.ts` `worktree_create`, and the BATS guard asserts
  the skill references `scripts/worktree-create.sh`
