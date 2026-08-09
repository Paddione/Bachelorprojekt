# Spec Delta: website-core

## ADDED Requirements

### Requirement: The model id is resolved at runtime

The audit SHALL obtain the model id to use from `GET /v1/models` on the llm-proxy (`:18235`) and
SHALL NOT hardcode a model id.

Rationale: the GPU host is switched between loadouts. While this change was being designed, the
same proxy reported `gemma9-factory` and then `gemma26-factory` within ten minutes, with a
concurrent agent lock switching loadouts. A hardcoded id produces a failure that looks like a
network problem and is not one.

#### Scenario: The proxy reports a different model than on the previous run

- **GIVEN** `/v1/models` returns exactly one entry with an arbitrary `id`
- **WHEN** stage 3 starts
- **THEN** the chat completion request uses exactly that `id`

#### Scenario: The proxy is unreachable

- **GIVEN** `:18235` does not respond
- **WHEN** the audit runs
- **THEN** it reports stages 1 and 2 in full, names stage 3 as failed, and exits 0

### Requirement: The model receives a semantic extract, not raw HTML

Stage 3 SHALL pass the model a structured extract only: every `alt` text with its image URL,
every `<meta>` tag, the heading hierarchy, and every link label with its target URL. Raw or
truncated HTML SHALL NOT be passed.

Rationale: an average rendered page is 50,000 to 200,000 tokens of markup, while the loadout in
use runs roughly 99,000 tokens of context. A pipeline that forwards markup fails on the second
route. The extract is a few kilobytes and holds exactly the surface being judged.

#### Scenario: Three routes in one run

- **GIVEN** `--routes /,/leistungen,/kontakt`
- **WHEN** stage 3 runs
- **THEN** the prompt sent to the model stays below 32,000 tokens

#### Scenario: An alt text is a file name

- **GIVEN** a route containing `<img alt="header-bg-2.webp">`
- **WHEN** stage 3 runs
- **THEN** the report contains a semantic finding for that route including the image URL

### Requirement: Thinking is disabled client-side

Every chat completion request SHALL set `chat_template_kwargs: {"enable_thinking": false}`.

Rationale: with thinking active, `content` stays empty until the thinking phase ends. A caller
running a tight `max_tokens` silently receives an empty response with `finish_reason=length` — a
failure that looks like a model outage. The existing callers in this repository
(`mishap-categorize.sh`, `plan-qa-check.sh`, `factory/ci-review.mjs`, `triage-body.sh`,
`brain-ingest-transform.sh`, `scout-llm-fallback.sh`) all do it this way.

#### Scenario: Response without a thinking phase

- **GIVEN** a stage 3 request
- **WHEN** the response arrives
- **THEN** `choices[0].message.content` is not empty

### Requirement: Stages 1 and 2 delegate rather than implement

The audit SHALL obtain axe findings through `task a11y:axe ENV=<brand>` and Lighthouse metrics
through the existing `lighthouserc.json`. It SHALL NOT define its own accessibility or
performance rules.

#### Scenario: The axe run fails

- **GIVEN** `task a11y:axe` exits non-zero
- **WHEN** the audit runs
- **THEN** it reports the failure with its exit code, skips triage of the axe findings, and still
  performs the semantic check
