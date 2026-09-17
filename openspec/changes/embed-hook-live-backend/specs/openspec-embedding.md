## ADDED Requirements

### Requirement: Dauerhafte Probe-Fehlschläge enden sofort und ohne Hook-Retry

`scripts/openspec-embed-local.sh` SHALL probe the embedding backend with a connect timeout
(`OPENSPEC_EMBED_CONNECT_TIMEOUT`, default 3s) that is separate from the overall probe budget
(`OPENSPEC_EMBED_PROBE_TIMEOUT`, default 20s). When `LLM_PROXY_ADMIN_TOKEN` is set, the probe
and the embed requests of `scripts/openspec-embed.mjs` SHALL send it as
`Authorization: Bearer <token>`, because the devmesh `llm-services` proxy rejects requests
without it. A probe failure that a retry cannot fix — no listener (curl 7), DNS failure
(curl 6), or HTTP 401/403/404 — SHALL end the wrapper with exit code 3; every other probe
failure (timeout, 5xx) SHALL keep exit code 1. On HTTP 401/403 the diagnosis SHALL name
`LLM_PROXY_ADMIN_TOKEN`. `.githooks/post-commit-embed` SHALL NOT retry the wrapper after
exit code 3 and SHALL keep retrying after any other non-zero exit code.

#### Scenario: No listener on the embedding port

- **GIVEN** nothing listens on the port in `LLM_EMBED_URL`
- **WHEN** `openspec-embed-local.sh <slug>` runs
- **THEN** the output names the probed URL and curl 7, and the wrapper exits with code 3

#### Scenario: Backend rejects the request

- **GIVEN** the backend answers the probe with HTTP 401
- **WHEN** `openspec-embed-local.sh <slug>` runs
- **THEN** the wrapper exits with code 3 and the output names `LLM_PROXY_ADMIN_TOKEN`

#### Scenario: Server error stays retryable

- **GIVEN** the backend answers the probe with HTTP 500
- **WHEN** `openspec-embed-local.sh <slug>` runs
- **THEN** the wrapper exits with code 1

#### Scenario: Bearer token is sent when configured

- **GIVEN** `LLM_PROXY_ADMIN_TOKEN` is set and the backend only accepts that bearer
- **WHEN** the wrapper probes and `defaultEmbed()` embeds
- **THEN** both requests carry `Authorization: Bearer <token>` and the probe passes

#### Scenario: Hook does not retry a permanent failure

- **GIVEN** a commit touches `openspec/changes/<slug>/tasks.md` and the wrapper exits with code 3
- **WHEN** `.githooks/post-commit-embed` runs
- **THEN** the wrapper is called exactly once and the hook exits 0

#### Scenario: Hook still retries a transient failure

- **GIVEN** the wrapper exits with code 1 on every attempt
- **WHEN** `.githooks/post-commit-embed` runs with the default of 3 attempts
- **THEN** the wrapper is called three times and the hook exits 0
