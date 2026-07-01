## ADDED Requirements

### Requirement: Lavish reload safety while a form is in flight

The `.claude/skills/lavish/SKILL.md` skill definition MUST document a
dedicated "Reload Safety" section that prevents agents from discarding a
user's in-flight, unsubmitted form input (`input` playbook selections, e.g. a
radio choice before an "Antwort senden" submit) when re-running
`npx -y lavish-axi <html-file>` to fix layout warnings — that re-run navigates
(reloads) the existing browser tab and wipes any client-only DOM state that
has not yet reached the Lavish server via a poll response.

#### Scenario: Reload Safety section exists and is discoverable

- **GIVEN** `.claude/skills/lavish/SKILL.md`
- **WHEN** the file is scanned for an H2 section whose header contains
  "Reload Safety"
- **THEN** such a section MUST exist

#### Scenario: Reload Safety section forbids reloading while a poll is outstanding

- **GIVEN** the Reload Safety section
- **THEN** it MUST state that the agent must never trigger a reload
  (re-running `npx -y lavish-axi <html-file>`) while a `poll` call is still
  outstanding / has not yet returned

#### Scenario: Reload Safety section requires checking poll status before reload

- **GIVEN** the Reload Safety section
- **THEN** it MUST require the agent to check the most recent poll
  result/status before triggering the next reload

#### Scenario: Reload Safety section calls out the input-playbook form-state risk

- **GIVEN** the Reload Safety section
- **THEN** it MUST explicitly name the `input` playbook / unsubmitted
  form-state risk as the reason for the rule

#### Scenario: Reload Safety section requires warning the user before a risky reload

- **GIVEN** the Reload Safety section
- **AND** the board contains an `input` playbook form with a possibly
  unsubmitted selection
- **THEN** the section MUST instruct the agent to explicitly warn the user
  before triggering the next reload and ask for confirmation/re-submit

### Requirement: dev-flow-gotchas cross-references the lavish reload-safety rule

`.claude/skills/references/dev-flow-gotchas.md` MUST contain a cross-reference
entry pointing to the lavish reload-safety rule so it is discoverable from the
gotchas index without requiring prior knowledge of the lavish skill file.

#### Scenario: Gotchas reference mentions lavish reload safety

- **GIVEN** `.claude/skills/references/dev-flow-gotchas.md`
- **WHEN** the file is scanned for the phrase "lavish" combined with "reload"
  (in either order)
- **THEN** a matching line MUST exist
