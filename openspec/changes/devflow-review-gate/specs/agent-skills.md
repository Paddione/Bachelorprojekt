# agent-skills — Delta (T005565)

## ADDED Requirements

### Requirement: dev-flow-execute implementer mandate includes the review gate

The implementer mandate section of `.claude/skills/dev-flow-execute/SKILL.md` SHALL require an independent code review via `superpowers:requesting-code-review` before the implementer creates the pull request, and SHALL mark this requirement as mandatory.

#### Scenario: mandate mentions the review gate as mandatory

- **GIVEN** the dev-flow-execute skill file
- **WHEN** a reader extracts the section between the `- **Auftrag:**` line and the next `## ` heading
- **THEN** the section contains `requesting-code-review` and `PFLICHT`
