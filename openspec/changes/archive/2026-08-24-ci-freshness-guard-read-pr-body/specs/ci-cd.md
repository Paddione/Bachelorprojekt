## ADDED Requirements

### Requirement: Baseline Guard PR Body Fallback and Hard Fail

The baseline assertion script SHALL attempt to read the PR body from the `GITHUB_EVENT_PATH` payload if the `PR_BODY` environment variable is unset. If reading from the payload fails, it SHALL fall back to `gh pr view`. If all methods fail, the script SHALL exit with a non-zero status code and an explicit error message, rather than returning an empty string and failing silently on missing tags.

#### Scenario: PR body cannot be read

- **GIVEN** a CI run where `PR_BODY` is empty, `GITHUB_EVENT_PATH` is unavailable or invalid, and `gh pr view` fails
- **WHEN** the baseline guard evaluates `readPrBody()`
- **THEN** it throws an error or calls `process.exit(1)` with a clear message indicating the read failure, instead of proceeding with an empty string.

#### Scenario: PR body is read from GITHUB_EVENT_PATH

- **GIVEN** a CI run where `PR_BODY` is empty but `GITHUB_EVENT_PATH` points to a valid JSON payload containing `.pull_request.body`
- **WHEN** the baseline guard evaluates `readPrBody()`
- **THEN** it successfully returns the PR body from the JSON payload.
