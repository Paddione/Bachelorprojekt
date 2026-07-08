## ADDED Requirements

### Requirement: Dynamic Coaching Model Discovery

The system SHALL offer the LM Studio models installed on the configured coaching
LLM endpoint as autocomplete suggestions for the coaching provider `modelName`
field, while always allowing free-text entry. A pure helper `fetchModelIds(baseUrl,
timeoutMs?)` SHALL perform a GET on `<baseUrl>/models`, parse the OpenAI response
shape `data[].id`, and return `{ reachable: boolean; models: string[] }`; any
network, timeout, or parse error SHALL yield `{ reachable: false, models: [] }`.
A new endpoint `GET /api/admin/coaching/ki-config/models?id=<configId>` SHALL
resolve the config's base URL via the shared endpoint resolver and return that
helper result. The endpoint SHALL require admin authentication and SHALL NOT
respond with a 5xx status for an unreachable or misconfigured endpoint.

#### Scenario: Reachable endpoint returns installed model ids
- **GIVEN** an admin session and a coaching KI config whose endpoint exposes an OpenAI-compatible `/models` route returning `{ data: [{ id: "qwen2.5-7b" }, { id: "mistral-7b" }] }`
- **WHEN** the admin requests `GET /api/admin/coaching/ki-config/models?id=<configId>`
- **THEN** the response is HTTP 200 with body `{ reachable: true, models: ["qwen2.5-7b", "mistral-7b"] }`

#### Scenario: Unreachable endpoint degrades to free text without a 5xx
- **GIVEN** an admin session and a coaching KI config whose endpoint refuses the connection or exceeds the ~2s timeout
- **WHEN** the admin requests the models endpoint
- **THEN** the response is HTTP 200 with body `{ reachable: false, models: [] }` and the model input remains editable as free text

#### Scenario: Non-admin caller is rejected
- **GIVEN** a request without a valid admin session
- **WHEN** the models endpoint is called
- **THEN** the response is HTTP 401 (no session) or HTTP 403 (non-admin) and no endpoint probe is performed

### Requirement: Coaching Provider Activation Allowlist Reflects Catalog

The system SHALL derive the allowlist for activating a coaching KI provider from
the catalog of known interfaces plus the `custom_` prefix, rather than a
hardcoded subset. Activating any catalog provider id (including `local-lmstudio`)
or any `custom_*` provider SHALL be permitted; an unknown provider id SHALL be
rejected.

#### Scenario: A local LM Studio provider can be activated
- **GIVEN** an admin session and a coaching provider row with provider id `local-lmstudio`
- **WHEN** the admin issues `PATCH /api/admin/coaching/ki-config/active` with `{ "provider": "local-lmstudio" }`
- **THEN** the request is accepted (not rejected as an invalid provider) and the provider is set active

#### Scenario: An unknown provider id is rejected
- **GIVEN** an admin session
- **WHEN** the admin issues the activation request with `{ "provider": "not-a-provider" }`
- **THEN** the response is HTTP 400 with an `Invalid provider` error and no activation occurs

### Requirement: Client PII Scrubbed Before LLM Dispatch

The system SHALL remove client personally identifiable information from the
coaching step prompts immediately before dispatching them to the session agent.
A pure helper `scrubClientPii(text, { names, emails?, replacement })` SHALL
replace, case-insensitively and on word boundaries (Unicode/Umlaut-safe), full
client names, individual name components of at least three characters, and
e-mail addresses with the supplied replacement, without matching substrings
inside longer words. In the step generation route, the scrubber SHALL be applied
to both the effective system prompt and the assembled user prompt, using name
sources from the coaching session's client name and the linked customer record,
with the replacement being the customer number or `[KLIENT]`. A scrubber failure
SHALL be logged and SHALL NOT crash the generation.

#### Scenario: A typed client name never reaches the agent call
- **GIVEN** a coaching step whose coach free-text contains the client's full name and the session is linked to a customer with number `K-100`
- **WHEN** the step generation route assembles the system and user prompts
- **THEN** the prompts passed to the session agent contain `K-100` in place of the name and no longer contain the client name

#### Scenario: Word boundaries prevent false positives
- **GIVEN** a client name component `Hannes` and prompt text containing the unrelated word `Beispielhannes`
- **WHEN** the scrubber runs
- **THEN** `Beispielhannes` is left unchanged while a standalone `Hannes` token would be replaced

#### Scenario: Empty name list is an identity transform
- **GIVEN** a scrub call with an empty `names` array and no `emails`
- **WHEN** the scrubber runs on any text
- **THEN** the text is returned unchanged
