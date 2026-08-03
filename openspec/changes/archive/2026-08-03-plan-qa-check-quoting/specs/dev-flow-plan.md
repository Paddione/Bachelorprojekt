## ADDED Requirements

### Requirement: Advisory plan QA builds a valid request payload

The plan QA check SHALL construct its request payload with a JSON-aware tool so that plan
content containing quotes, backslashes, backticks or newlines is transmitted intact.

#### Scenario: Plan with special characters

- **GIVEN** an implementation plan containing double quotes, backticks, backslashes and newlines
- **WHEN** the plan QA check builds its request payload
- **THEN** the payload parses as valid JSON and carries the plan content unaltered

### Requirement: Prompt text is not subject to shell substitution

The plan QA check SHALL build its system prompt so that no part of the prompt text is evaluated
by the shell. Backticks and dollar signs in the criteria text SHALL reach the model verbatim.

#### Scenario: Criteria text contains a shell metacharacter

- **GIVEN** a QA criterion whose text includes a backtick-quoted example such as `< file`
- **WHEN** the plan QA check assembles the system prompt
- **THEN** the example appears verbatim in the prompt and no command is executed

### Requirement: Payload construction is verifiable offline

The plan QA check SHALL offer a mode that writes the assembled payload to stdout without
performing a network request, so that payload construction can be tested without a reachable
LLM endpoint, API key or network access.

#### Scenario: Test run in an offline CI environment

- **GIVEN** no reachable LLM endpoint and no API key
- **WHEN** the plan QA check is invoked in payload-emitting mode with a plan file
- **THEN** it writes the payload to stdout and exits successfully

### Requirement: Internal defects are distinguishable from an unreachable endpoint

The plan QA check SHALL treat an unreachable endpoint and an invalid payload differently. An
unreachable endpoint SHALL be skipped silently so that offline work and CI are never blocked.
An invalid payload SHALL emit a warning on stderr, because it indicates a defect in the check
itself. Both cases SHALL keep the advisory contract and exit successfully.

#### Scenario: Endpoint is unreachable

- **GIVEN** the configured LLM endpoint does not answer
- **WHEN** the plan QA check runs
- **THEN** it reports the skip and exits successfully without a warning about a defect

#### Scenario: Assembled payload is invalid

- **GIVEN** the assembled payload is not valid JSON
- **WHEN** the plan QA check runs
- **THEN** it emits a warning on stderr naming the defect and exits successfully

### Requirement: Local gateway requests disable model thinking

The plan QA check SHALL disable model thinking when requesting the local gateway, because the
served model otherwise consumes the token budget before producing an answer and returns empty
content.

#### Scenario: Request against the local gateway

- **GIVEN** the plan QA check targets the local gateway
- **WHEN** it sends a request
- **THEN** the request disables thinking and the response carries non-empty content
