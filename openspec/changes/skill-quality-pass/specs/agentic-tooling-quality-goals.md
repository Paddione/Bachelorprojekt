## MODIFIED Requirements

### Requirement: G-AGENTIC09 God-Skill Line Budget Tracked

The count of **project-owned** `SKILL.md` files exceeding **250 lines** SHALL be measured as a
fail-closed Gate with target 0.

The project-owned set is derived from `.claude/skills/OVERVIEW.md`: every tracked `SKILL.md`
whose directory name is not listed in that file's third-party section. Upstream-maintained skills
are excluded because editing them would create merge conflicts on the next sync, so a budget that
counted them could never reach zero without touching files this repository does not own.

The previous formulation measured all skills against a 500-line threshold as an advisory Target.
That threshold sat far above the progressive-disclosure budget it was meant to protect, and as a
Target it could not stop a regression — it only recorded one.

#### Scenario: Counting oversized project-owned skills

- **GIVEN** all tracked `SKILL.md` files and the third-party section of `OVERVIEW.md`
- **WHEN** the G-AGENTIC09 measure command counts lines per project-owned file
- **THEN** the count of files exceeding 250 lines is 0

#### Scenario: A vendor skill exceeds the threshold

- **GIVEN** `.claude/skills/gitops-knowledge/SKILL.md` has 460 lines
- **AND** `OVERVIEW.md` names `gitops-knowledge` in its third-party section
- **WHEN** the G-AGENTIC09 measure command runs
- **THEN** the file is not counted and the Gate stays green

#### Scenario: A project-owned skill regresses past the budget

- **GIVEN** a project-owned `SKILL.md` grows from 240 to 260 lines
- **WHEN** `bash scripts/health-goals-check.sh --only=G-AGENTIC09` runs
- **THEN** the Gate reports a non-zero count and exits non-zero

### Requirement: G-AGENTIC08 No Dead Script/Task References In Skills Gate

The count of non-existent `scripts/…` paths quoted in the Markdown of **project-owned** skills
SHALL be measured as a fail-closed Gate with target 0. The scope covers every `.md` file of those
skills plus `.claude/skills/references/`, not only files named `SKILL.md`.

The previous formulation matched `--include=SKILL.md` only. Relocating procedure text into a
reference file therefore removed its script paths from the gate's scope — the very move that
progressive disclosure encourages. Vendor skills are excluded because their `scripts/…` mentions
are relative to the skill directory and resolve correctly there, while the repo-relative check
would report them as dead.

#### Scenario: a relocated block quotes a script path

- **GIVEN** a block quoting `scripts/plan-lint.sh` moves from a `SKILL.md` into
  `.claude/skills/references/`
- **WHEN** the G-AGENTIC08 measure command runs
- **THEN** the path is still checked, because the scope covers all `.md` of project-owned skills

#### Scenario: a vendor skill quotes a skill-relative script path

- **GIVEN** `.claude/skills/gitops-repo-audit/references/api-migration.md` mentions
  `scripts/validate.sh`, which exists at `.claude/skills/gitops-repo-audit/scripts/validate.sh`
- **WHEN** the G-AGENTIC08 measure command runs
- **THEN** the file is not inspected and the Gate stays green, because vendor skills are out of
  scope
