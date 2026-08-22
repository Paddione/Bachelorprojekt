# harness-workflow-split

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu harness-workflow-split ergänzen._

## Requirements

### Requirement: opencode has native dev-flow and git-workflow skills

opencode SHALL provide four workflow skill entries under `.opencode/skills/`:
`opencode-flow-plan`, `opencode-flow-execute`, `opencode-flow-chore` (directory
symlinks resolving to the harness-neutral sources `.claude/skills/dev-flow-plan`,
`.claude/skills/dev-flow-execute`, and `.claude/skills/dev-flow-chore`) and
`opencode-git-workflow` (a native file, kept because it carries opencode-specific
git-crypt/worktree glue). The shared sources SHALL be harness-neutral: they SHALL NOT
contain raw Claude-only tool syntax (`AskUserQuestion`, `TodoWrite`,
`subagent_type`, or the literal `Task tool`) anywhere in the file, and SHALL carry
per-harness dispatch guidance as clearly labeled matrix entries instead. The symlink
mechanism SHALL follow the established `openspec-*` pattern
(`.opencode/skills/<name> -> ../../.claude/skills/<source>`).

#### Scenario: opencode loads the shared source under its native name

- **GIVEN** an opencode session on a feature request in this repo
- **WHEN** opencode invokes `opencode-flow-plan`
- **THEN** the loaded content is byte-identical to `.claude/skills/dev-flow-plan/SKILL.md`
  and delegates sub-work through the labeled harness matrix (`background-agents.ts` /
  `delegate` for opencode, the native subagent dispatch for Claude Code) — never via raw
  `AskUserQuestion`, `TodoWrite`, `subagent_type`, or `Task tool` syntax

#### Scenario: BATS guard confirms symlinks resolve to token-free sources

- **GIVEN** the guard `tests/spec/harness-workflow-split.bats`
- **WHEN** `bats tests/spec/harness-workflow-split.bats` runs
- **THEN** it asserts the three flow-skill entries are symlinks resolving into
  `.claude/skills/dev-flow-*`, that `opencode-git-workflow/SKILL.md` is a regular file,
  that all four resolved contents collectively reference `background-agents.ts` and
  `worktree.ts`, contain none of the forbidden tokens, and that the flow skills
  reference `git-workflow` while `opencode-git-workflow` references
  `scripts/worktree-create.sh`

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

### Requirement: the tool registry records a harness per entry

`docs/agent-guide/registry/tools.yaml` SHALL carry a `harness` field on every entry with a value
in `{claude, opencode, dsh, both, all}`, validated by `scripts/agent-guide/validate.mjs`.
`scripts/agent-guide/emit-maps.mjs` SHALL render a `Harness` column in
`docs/agent-guide/maps/tools-map.md`.

The value `both` SHALL keep its established meaning of "Claude Code and opencode" so that every
pre-existing entry stays correct without being rewritten. The value `all` SHALL mean "every
declared harness including dsh". A tool reachable from dsh only SHALL be marked `dsh`.

#### Scenario: validate rejects a missing or invalid harness

- **GIVEN** a registry fixture whose tool entry has an invalid `harness` value
- **WHEN** `validateRegistry(dir)` runs
- **THEN** it returns `ok: false` with an error mentioning `harness`

#### Scenario: validate accepts the dsh harness

- **GIVEN** a registry fixture whose tool entry declares `harness: dsh`
- **WHEN** `validateRegistry(dir)` runs
- **THEN** it returns `ok: true`, and the same holds for `harness: all`

#### Scenario: both keeps its two-harness meaning

- **GIVEN** the registry entries that declared `harness: both` before this change
- **WHEN** `validateRegistry(dir)` runs after the enum is widened
- **THEN** every one of them still validates, and none has been rewritten to `all` as a side
  effect of adding dsh

#### Scenario: tools-map renders the Harness column

- **GIVEN** the regenerated `docs/agent-guide/maps/tools-map.md`
- **WHEN** it is read
- **THEN** each tool table header carries a `Harness` column and every row shows one of
  `claude`, `opencode`, `dsh`, `both`, or `all`

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

Because only `opencode-git-workflow` remains a native file, its git-crypt-safe worktree
requirement applies verbatim: the skill SHALL create worktrees via the git-crypt-safe
`scripts/worktree-create.sh` and document the `worktree.ts` limitation, so encrypted
paths under `environments/.secrets/**` neither fail checkout nor leak encrypted-at-rest
content with a stale smudge filter.

#### Scenario: opencode worktree creation on a git-crypt repo is safe

- **GIVEN** the `opencode-git-workflow` skill
- **WHEN** it prepares an isolated worktree for a branch touching git-crypt-managed paths
- **THEN** it uses `scripts/worktree-create.sh` (which copies/neutralizes the git-crypt
  filter) rather than a bare `worktree.ts` `worktree_create`, and the BATS guard asserts
  the skill references `scripts/worktree-create.sh`

### Requirement: AGENTS.md declares the shared-source routing

The `## Skill Dispatch Protocol` section of `AGENTS.md` SHALL describe that opencode
loads the same dev-flow sources as Claude Code via the `opencode-flow-*` symlinks, and
SHALL NOT instruct agents to avoid the `dev-flow-*` flow skills. The section SHALL
remain free of raw Claude tool names.

#### Scenario: routing reflects the shared source

- **GIVEN** `AGENTS.md`
- **WHEN** the `## Skill Dispatch Protocol` section is extracted
- **THEN** it states that `opencode-flow-*` resolve to the `dev-flow-*` sources and
  contains none of `AskUserQuestion`, `TodoWrite`, `subagent_type`, `Task tool`

<!-- merged from change delta harness-workflow-split.md (365b3d9750ed) -->