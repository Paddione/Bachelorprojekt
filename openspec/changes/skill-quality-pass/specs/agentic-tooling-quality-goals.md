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
