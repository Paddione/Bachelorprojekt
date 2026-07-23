## MODIFIED Requirements

### Requirement: G-AGENTIC09 God-Skill Line Budget Tracked

The count of `SKILL.md` files exceeding 500 lines SHALL be measured and documented as a Target
baseline in `goals.md`, without a forced split and without failing CI. `dev-flow-plan/SKILL.md`
and `dev-flow-execute/SKILL.md` SHALL each stay at or below 500 lines by extracting verbose or
duplicated operational blocks into `.claude/skills/references/*.md` and linking to them via
`file://` references, per the T001904 precedent — without losing any operational instruction.

#### Scenario: Counting oversized skills

- **GIVEN** all `.claude/skills/*/SKILL.md` files
- **WHEN** the G-AGENTIC09 measure command counts lines per file
- **THEN** the count of files exceeding 500 lines is recorded as the documented Target baseline

#### Scenario: dev-flow-plan and dev-flow-execute stay under the 500-line threshold

- **GIVEN** `.claude/skills/dev-flow-plan/SKILL.md` and `.claude/skills/dev-flow-execute/SKILL.md`
  after extracting verbose/duplicated blocks into `.claude/skills/references/*.md`
- **WHEN** `find .claude/skills -name SKILL.md -exec wc -l {} + | awk '$2!="total"&&$1>500{c++} END{print c+0}'`
  is executed
- **THEN** it prints `0`
