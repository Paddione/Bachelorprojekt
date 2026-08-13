## ADDED Requirements

### Requirement: Questionnaire answers are semantically analyzed into themed clusters

The system SHALL embed all questionnaire answers (bge-m3, fail-closed) and group them with DBSCAN clustering so that admins can identify recurring client themes.

#### Scenario: Admin triggers the analysis

- **GIVEN** an authenticated admin and questionnaire answers with `details_text`
- **WHEN** a POST request is sent to `/api/admin/coaching/questionnaire/insights`
- **THEN** the response contains clusters with a label, the answer count, representative answers, the embedding model and a timestamp

#### Scenario: The embedding backend is unreachable

- **GIVEN** the embedding backend is not reachable
- **WHEN** the analysis endpoint is called
- **THEN** the request fails with HTTP 503 and no partial analysis is returned

### Requirement: Insights results are cached for 24 hours

The system SHALL cache the analysis result for 24 hours so repeated requests do not re-embed and re-cluster the whole answer set.

#### Scenario: A fresh cache entry exists

- **GIVEN** an analysis result created less than 24 hours ago
- **WHEN** the analysis endpoint is called without `force`
- **THEN** the cached result is returned with `cached: true` and no embedding call is made

#### Scenario: Forced recalculation

- **GIVEN** an existing cache entry
- **WHEN** the analysis endpoint is called with `force: true`
- **THEN** a fresh analysis is computed and the cache is overwritten

### Requirement: Session summaries are generated from all step contents

The system SHALL generate a structured summary of a coaching session from the `ai_response` and `coach_notes` of all its steps and store it on the session.

#### Scenario: Admin generates a summary

- **GIVEN** an authenticated admin and a coaching session with generated steps
- **WHEN** a POST request is sent to `/api/admin/coaching/sessions/{id}/summary`
- **THEN** the session gets `llm_summary` and `llm_summary_at` set and the summary is returned

#### Scenario: Session content is missing

- **GIVEN** a session without any step contents
- **WHEN** the summary endpoint is called
- **THEN** the request fails with HTTP 400 and no LLM call is made

### Requirement: Summary generation is idempotent

The system SHALL NOT re-generate an existing summary unless explicitly forced.

#### Scenario: Summary already exists

- **GIVEN** a session with `llm_summary_at` set
- **WHEN** the summary endpoint is called without `force`
- **THEN** the stored summary is returned with `cached: true` and the provider is not called again

#### Scenario: Forced regeneration

- **GIVEN** a session with an existing summary
- **WHEN** the summary endpoint is called with `force: true`
- **THEN** a new summary is generated and stored

### Requirement: Coaching content is only sent to on-premises providers

The system SHALL route all insight and summary generation through the DSGVO-guarded session-agent path, which refuses external providers before any request is sent.

#### Scenario: Provider is not declared on-premises

- **GIVEN** the active provider is not declared with `data_residency = 'on_premises'`
- **WHEN** a summary or label generation is attempted
- **THEN** the request fails with `DataResidencyError` and no provider call is ever made

#### Scenario: Provider is on-premises

- **GIVEN** an active provider declared as `on_premises`
- **WHEN** a summary or label generation is attempted
- **THEN** the request is sent with the `x-llm-local-only` header and the local backend must fail instead of falling back to a remote backend
