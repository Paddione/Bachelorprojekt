## ADDED Requirements

### Requirement: Quick-select choice chips

The Grilling stepper SHALL render quick-select choice chips above the answer
textarea for any question whose definition includes a non-empty `choices`
array, and clicking a chip SHALL set that question's answer to the chip text.

#### Scenario: Question with choices renders chips

- **GIVEN** a questionnaire question that defines `choices: ['Unit', 'E2E']`
- **WHEN** the stepper displays that question in step mode
- **THEN** a chip button is rendered for each choice with `data-testid="grilling-choice-<choice-with-spaces-as-dashes>"`

#### Scenario: Clicking a chip fills the answer

- **GIVEN** a question with choices is displayed
- **WHEN** the user clicks the chip for "Ja, aber kontrolliert"
- **THEN** the answer textarea content becomes exactly "Ja, aber kontrolliert"
- **AND** the change is persisted via the existing debounced PATCH to `/api/admin/tickets/{id}`

#### Scenario: Question without choices renders no chips

- **GIVEN** a question whose definition has no `choices` field
- **WHEN** the stepper displays that question
- **THEN** no `grilling-choice-*` chip button is rendered

### Requirement: Show-all mode lists every question

The Grilling stepper SHALL, when its mode is `all`, render every resolved
question as a list (not the single-question stepper template), visually
distinguishing answered, dismissed, and open questions.

#### Scenario: All mode shows all questions

- **GIVEN** a questionnaire with 23 questions
- **WHEN** the user toggles the mode to `all`
- **THEN** a container with `data-testid="grilling-all-list"` contains all 23 question labels
- **AND** answered questions show a preview of their answer text

### Requirement: Dynamic questionnaire selection

The admin ticket detail page SHALL select the grilling questionnaire id from
the ticket's existing answer keys (excluding the legacy `coaching-sessions-v1`
key) and SHALL default to `final-grilling-v1` when no other key is present,
instead of hardcoding `coaching-sessions-v1`.

#### Scenario: Ticket with no prior answers defaults to final-grilling-v1

- **GIVEN** a ticket whose `grillingAnswers` is null or contains only `coaching-sessions-v1`
- **WHEN** the ticket detail page mounts the stepper
- **THEN** the stepper receives `questionnaireId = "final-grilling-v1"`

#### Scenario: Ticket with existing non-coaching answers keeps its questionnaire

- **GIVEN** a ticket whose `grillingAnswers` already has a `final-grilling-v1` key
- **WHEN** the ticket detail page mounts the stepper
- **THEN** the stepper receives that existing questionnaire id
