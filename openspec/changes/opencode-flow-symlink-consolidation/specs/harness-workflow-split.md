# harness-workflow-split Delta

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: AGENTS.md declares an opencode-native dispatch protocol

**Reason:** Superseded by the shared-source routing below — opencode no longer avoids
the dev-flow skills; it loads the same sources under native names.

## ADDED Requirements

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
