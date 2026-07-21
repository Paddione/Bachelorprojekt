# superpowers-writing-plans

## Purpose

Der Plan-Schreib-Skill — ein eingebauter Claude-Code-Superpower, der in opencode/agy
als Stub-Redirect auf den `dev-flow-plan`-Skill weiterleitet. Der Skill definiert die
Disziplin für die Erstellung von Implementierungsplänen inklusive Plan-Lint-Hard-Rules,
Subagent-Prompt-Verträge und Qualitäts-Tore.

---

## Requirements

### Requirement: Stub Redirect for Non-Claude-Code Frameworks

The system SHALL provide `.claude/skills/superpowers-writing-plans/SKILL.md` as a stub
file that redirects to `dev-flow-plan/SKILL.md` for opencode and agy users. The stub
SHALL contain a `[STUB]` marker in its description frontmatter and a framework mapping
table documenting availability per framework.

#### Scenario: Stub file exists with correct frontmatter

- **GIVEN** the repository checkout
- **WHEN** reading `.claude/skills/superpowers-writing-plans/SKILL.md`
- **THEN** the frontmatter contains `name: superpowers:writing-plans` and `description:` includes `[STUB]`

#### Scenario: Stub contains framework mapping table

- **GIVEN** the stub SKILL.md
- **WHEN** reading the body
- **THEN** it contains a framework mapping table with rows for Claude Code, opencode, and agy

### Requirement: Plan-Lint Hard Rules in Step 3.7 Prompt

The `dev-flow-plan` Step 3.7 subagent-prompt block MUST enumerate the plan-lint hard
rules (F1 frontmatter keys, F2 non-empty domains, STRUCT1 plan shape, STRUCT2
failing-test step, STRUCT3 verify-task gates, P1 placeholder ban) so a fresh subagent
reading only the prompt produces a plan that passes `bash scripts/plan-lint.sh`.

#### Scenario: Step 3.7 prompt mentions all four F1 frontmatter keys

- **GIVEN** the Step 3.7 subagent-prompt block in `.claude/skills/dev-flow-plan/SKILL.md`
- **WHEN** scanning for frontmatter rules
- **THEN** the block contains the words `title`, `ticket_id`, `domains`, and `status`

#### Scenario: Step 3.7 prompt requires the File Structure section

- **GIVEN** the Step 3.7 subagent-prompt block
- **WHEN** scanning for structural rules
- **THEN** the block contains the phrase `File Structure` and `expected: FAIL`

#### Scenario: Step 3.7 prompt lists mandatory verify-task commands

- **GIVEN** the Step 3.7 subagent-prompt block
- **WHEN** scanning for verify commands
- **THEN** the block contains `task test:changed`, `task freshness:regenerate`, and `task freshness:check`

#### Scenario: Step 3.7 prompt bans placeholders

- **GIVEN** the Step 3.7 subagent-prompt block
- **WHEN** scanning for the P1 placeholder ban
- **THEN** the block mentions at least one of `TBD`, `TODO`, or `FIXME`

### Requirement: Real Logic Location

The actual plan-writing workflow (brainstorming, spec creation, plan generation, quality
gates) lives in `dev-flow-plan/SKILL.md`, not in the superpowers stub. For Claude Code
users, the built-in superpower is invoked directly.

#### Scenario: dev-flow-plan contains the full workflow

- **GIVEN** `.claude/skills/dev-flow-plan/SKILL.md`
- **WHEN** reading the skill body
- **THEN** it contains steps for brainstorming, spec creation, plan generation, and quality gates

---

## Key Files

- `.claude/skills/superpowers-writing-plans/SKILL.md` — stub redirect (27 lines)
- `.claude/skills/dev-flow-plan/SKILL.md` — real logic (479 lines)
- `openspec/specs/dev-flow-plan.md` — SSOT for plan-lint rules

---

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-07-21 -->
