## MODIFIED Requirements

### Requirement: OVERVIEW.md must name the complete vendor skill set

`.claude/skills/OVERVIEW.md` MUST list every tracked skill that originates outside this
repository in its third-party section. The section is the single machine-readable source for the
project-owned / vendor split: a tracked skill is **project-owned** exactly when its directory
name does not appear in that section.

Without this list the split exists only in prose, so no gate can scope itself to project-owned
skills without hardcoding a name list that drifts independently.

`OVERVIEW.md` MUST NOT name a skill directory that does not exist, and entries MUST link to the
source `SKILL.md` rather than to a rendered artifact, which does
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
