## ADDED Requirements

### Requirement: OVERVIEW.md must name the complete vendor skill set

`.claude/skills/OVERVIEW.md` MUST list every tracked skill that originates outside this
repository in its third-party section. The section is the single machine-readable source for the
project-owned / vendor split: a tracked skill is **project-owned** exactly when its directory
name does not appear in that section.

Without this list the split exists only in prose, so no gate can scope itself to project-owned
skills without hardcoding a name list that drifts independently.

`OVERVIEW.md` MUST NOT name a skill directory that does not exist, and entries MUST link to the
source `SKILL.md` rather than to a rendered artifact under `k3d/docs-content-built/`, which does
not survive a rename and is not readable from a repository checkout.

#### Scenario: a vendor skill is missing from the third-party section

- **GIVEN** `.claude/skills/vitest/SKILL.md` is tracked and carries `metadata.author: Anthony Fu`
- **AND** `OVERVIEW.md` does not name `vitest` in its third-party section
- **WHEN** the project-owned skill set is derived from `OVERVIEW.md`
- **THEN** `vitest` is wrongly counted as project-owned and the derivation is rejected until the
  section names it

#### Scenario: OVERVIEW.md names a removed skill

- **GIVEN** `OVERVIEW.md` contains a row for `cluster-deployment`
- **AND** no directory `.claude/skills/cluster-deployment/` exists
- **WHEN** the skill inventory is audited
- **THEN** the row is removed, and any capability it described is attributed to the skill that
  absorbed it

### Requirement: Every active project-owned skill must carry a description

Each project-owned `SKILL.md` MUST declare a YAML frontmatter block containing a `description`
field, unless it declares `archived: true`. A skill whose file begins without a frontmatter
delimiter has no description at all: the harness falls back to the first heading, which is a
title rather than a trigger phrase, so the skill can only ever be reached by being named
explicitly.

The `description` MUST name the concrete terms the skill is meant to fire on — paths, commands,
domain nouns — rather than only its category. Where a skill must NOT fire automatically, the
`description` MUST say so.

The `archived: true` exemption mirrors the existing G-AGENTIC07 measurement, which likewise only
counts skills that carry a `description`.

#### Scenario: a project-owned skill has no frontmatter block

- **GIVEN** `.claude/skills/brain-ingest/SKILL.md` starts with `# brain-ingest` on line 1
- **WHEN** the skill frontmatter is audited
- **THEN** a frontmatter block with `name` and a trigger-bearing `description` is added

#### Scenario: an archived skill deliberately omits its description

- **GIVEN** `.claude/skills/update-dependencies/SKILL.md` declares `archived: true` and no
  `description`
- **WHEN** the skill frontmatter is audited
- **THEN** the omission is accepted, because the skill runs as a scheduled routine and is not
  meant to be listed in interactive sessions

### Requirement: Project-owned skill bodies must respect the progressive-disclosure budget

A project-owned `SKILL.md` MUST NOT exceed 250 lines. Every skill name and `description` in
`.claude/skills/` is eagerly listed in every agent session, and the body is loaded in full on
invocation; an oversized body spends context on procedure detail that most invocations never
reach.

Detail that exceeds the budget MUST be moved into `.claude/skills/references/` and linked from
the body, following the pattern already established there. Decision logic, guards and stop
conditions MUST remain in the body — only procedure detail such as command sequences, lookup
tables and special cases may be relocated, and each link MUST state what the target file
contains so the reader can decide whether to follow it.

Shortening a body MUST NOT remove a step. This requirement governs where content lives, not
whether a workflow keeps it.

#### Scenario: an orchestrator skill exceeds the budget

- **GIVEN** `.claude/skills/dev-flow-execute/SKILL.md` has 486 lines
- **WHEN** the progressive-disclosure budget is enforced
- **THEN** procedure detail is moved into `.claude/skills/references/` and the body links to it,
  leaving the body at 250 lines or fewer with every step still reachable

#### Scenario: a vendor skill exceeds the budget

- **GIVEN** `.claude/skills/gitops-knowledge/SKILL.md` has 460 lines
- **AND** `OVERVIEW.md` names `gitops-knowledge` in its third-party section
- **WHEN** the progressive-disclosure budget is enforced
- **THEN** the file is left unchanged, because upstream-maintained skills are out of scope and
  editing them would create merge conflicts on the next sync

### Requirement: A forked vendor skill must declare the fork

A tracked `SKILL.md` that carries upstream provenance metadata — such as `license`, an author
under `metadata`, or a `generatedBy` version — while its body has been modified in this
repository MUST replace that metadata with an explicit statement that the file is a fork, naming
the upstream source and the change that forked it.

Provenance metadata claiming an unmodified upstream origin invites a re-sync that would silently
discard the local changes.

#### Scenario: an openspec skill carries upstream metadata but a modified body

- **GIVEN** `.claude/skills/openspec-explore/SKILL.md` declares `metadata.author: openspec` and
  `generatedBy: "1.3.1"`
- **AND** its body was modified in this repository after installation
- **WHEN** the skill frontmatter is audited
- **THEN** the upstream metadata is replaced with a fork declaration naming the upstream project
  and the change that installed it
