## ADDED Requirements

### Requirement: Thinking wird für lokal servierte Modelle abgeschaltet

Konsumenten, die einen Request an einen **lokal servierten** LLM-Endpunkt bauen, MUST set
`chat_template_kwargs.enable_thinking` to `false`. Locally served hybrid reasoning models
write to `reasoning_content` first and leave `choices[0].message.content` empty until
thinking completes; when `max_tokens` is exhausted before that point, the response carries
`finish_reason=length` with empty `content` and no error.

Requests to **remote** providers MUST NOT carry the `chat_template_kwargs` field, because it
is an unknown field there and may be rejected.

The decision MUST be derived from the target URL, not from the model name: a model-name test
misses every locally served model it was not written for.

#### Scenario: Locally served endpoint
- **GIVEN** a request targeting a loopback base URL such as `http://127.0.0.1:18235/v1`
- **WHEN** the request body is built
- **THEN** the body contains `chat_template_kwargs.enable_thinking = false`

#### Scenario: Remote provider endpoint
- **GIVEN** a request targeting a remote base URL such as `https://api.deepseek.com/v1`
- **WHEN** the request body is built
- **THEN** the body contains no `chat_template_kwargs` key

#### Scenario: Token budget suffices once thinking is off
- **GIVEN** a request with a small `max_tokens` budget against a locally served model
- **WHEN** `enable_thinking` is `false`
- **THEN** the response carries `finish_reason=stop` and a non-empty `content`

### Requirement: Request-Bauer sind offline prüfbar

Der Aufbau eines LLM-Request-Bodys MUST live in a unit that can be invoked without a
database, without network access and without a running model server, so that its result can
be asserted in the offline test suite.

Concretely: `scripts/factory/triage-body.sh` is sourceable without side effects and exposes
`_build_triage_body <model> <base_url> <system> <user> <schema_json>`;
`scripts/health-goals-payload.py` is callable as `python3 health-goals-payload.py <model> <gid>`
with the context on stdin.

#### Scenario: Body builder invoked from an offline test
- **GIVEN** no database, no network and no running LLM server
- **WHEN** the test sources `scripts/factory/triage-body.sh` and calls `_build_triage_body`
- **THEN** a complete request body is written to stdout and can be asserted with `jq`

#### Scenario: Payload builder invoked from an offline test
- **GIVEN** no running LLM server
- **WHEN** the test pipes context into `scripts/health-goals-payload.py`
- **THEN** a complete payload is written to stdout and can be asserted with `jq`
