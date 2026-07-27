## ADDED Requirements

### Requirement: The tracked skill inventory must contain no redirect-only or archived skills

`.claude/skills/` MUST NOT contain a tracked `SKILL.md` whose entire body is a redirect to
another skill or to a framework built-in. A skill directory qualifies as redirect-only when its
`description` frontmatter carries a `[STUB]` marker, or when it declares `archived: true` and
names a successor skill instead of a runbook.

Every entry in `.claude/skills/` is eagerly listed by name and `description` in every agent
session across Claude Code, agy and opencode. A redirect-only entry therefore costs context in
every session while contributing no executable workflow.

A skill MUST NOT declare a `name:` frontmatter value that collides with a skill provided by an
installed plugin (for example `superpowers:writing-plans`). Resolution order between a
project-local skill and an identically named plugin skill is not specified by any harness, so a
collision makes it unpredictable which body loads.

#### Scenario: a redirect-only stub is present in the tracked inventory

- **GIVEN** `.claude/skills/test-driven-development/SKILL.md` exists and is tracked by git
- **AND** its `description` frontmatter begins with `[STUB]`
- **WHEN** the skill inventory is audited
- **THEN** the directory is removed and any cross-reference to it is rewritten to name the
  replacement skill directly

#### Scenario: a project-local skill shadows a plugin skill name

- **GIVEN** `.claude/skills/superpowers-writing-plans/SKILL.md` declares
  `name: superpowers:writing-plans`
- **AND** the installed superpowers plugin provides a skill with the same name
- **WHEN** the skill inventory is audited
- **THEN** the project-local directory is removed so exactly one skill answers to that name

#### Scenario: a skill superseded by another skill's section is retained as a tombstone

- **GIVEN** `.claude/skills/llm-ops/SKILL.md` declares `archived: true` and points at
  `infra-ops` section 5
- **WHEN** the skill inventory is audited
- **THEN** the directory is removed and the references in `OVERVIEW.md`,
  `.claude/skills/infra-ops/SKILL.md` and `.claude/agents/bachelorprojekt-ops.md` name
  `infra-ops` directly

### Requirement: Removing a skill must keep the inventory health goals at target

Any change that adds or removes a directory under `.claude/skills/` MUST update
`.claude/skills/OVERVIEW.md` in the same change so that the skill count claimed there equals the
number of tracked `SKILL.md` files, which is what G-AGENTIC06 measures via
`git ls-files -- .claude/skills` filtered on `/SKILL.md`.

The change MUST also leave G-AGENTIC07 (orphaned active skills) at zero: every retained skill
that carries a `description` field MUST still be referenced from at least one of `CLAUDE.md`,
`AGENTS.md`, `.claude/skills/OVERVIEW.md`, or another `SKILL.md`.

#### Scenario: skills are removed and the counter is updated in the same change

- **GIVEN** 11 tracked skill directories are removed, leaving 28 tracked `SKILL.md` files
- **WHEN** `task freshness:check` runs
- **THEN** G-AGENTIC06 measures 0 because `OVERVIEW.md` claims 28

#### Scenario: removing a cross-reference orphans a retained skill

- **GIVEN** a retained skill with a `description` field whose only reference was in a removed
  stub's body
- **WHEN** the stub is removed without adding a replacement reference
- **THEN** G-AGENTIC07 rises above zero and the change is incomplete until a reference is
  restored in `OVERVIEW.md` or another `SKILL.md`

### Requirement: Locally installed untracked skills must be recorded, not silently ignored

Skills installed outside git (for example via market-cli) are listed by Claude Code but cannot be
removed by a pull request. `.claude/skills/OVERVIEW.md` MUST name every such untracked skill that
is present, so the gap between what an agent session lists and what the repository controls is
visible rather than implicit.

#### Scenario: an untracked skill is present in the working copy

- **GIVEN** `.claude/skills/whisper/SKILL.md` exists but is not tracked by git
- **WHEN** the skill inventory is audited
- **THEN** `OVERVIEW.md` records it as locally installed and untracked, and the removal is
  described as a manual operator step

## REMOVED Requirements

### Requirement: superpowers-writing-plans stub must exist for opencode compatibility

**Reason**: The stub declared `name: superpowers:writing-plans`, colliding with the plugin skill
of the same name. opencode denies that name outright in its skill permission list, so the stub
never served the compatibility purpose it was created for. The four scenarios that asserted
properties of `dev-flow-plan` itself are preserved in `tests/spec/dev-flow-plan.bats`.

**Migration**: Invoke `superpowers:writing-plans` (plugin) in Claude Code, or follow the inlined
plan-writing steps in `dev-flow-plan/SKILL.md` step 3.7 in opencode and agy.

### Requirement: superpowers-executing-plans stub must exist for opencode compatibility

**Reason**: Same collision as above, with `name: superpowers:executing-plans`. The four scenarios
that asserted properties of `dev-flow-execute` itself are preserved in
`tests/spec/dev-flow-execute.bats`.

**Migration**: Invoke `superpowers:executing-plans` (plugin) in Claude Code, or follow
`dev-flow-execute/SKILL.md` in opencode and agy.
