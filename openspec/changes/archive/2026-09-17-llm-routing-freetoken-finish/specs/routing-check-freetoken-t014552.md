## MODIFIED Requirements

### Requirement: Routing check probes the FreeToken backend, not the retired proxy

The probe list in `scripts/llm/routing-check.sh` SHALL target the
FreeToken-native engine (`http://127.0.0.1:1919`) and LM Studio
(`http://127.0.0.1:1234`, embeddings only). It SHALL NOT probe the retired
llm-proxy (`:18235`, stopped 2026-09-03, ADR-007; T900208, T900213).

Rationale: T900164 banned `:1919` from the probe list when FreeToken was
decommissioned; T900208 re-established it as the only local generation
backend. Probing the dead proxy instead makes the check green only while a
leftover process answers, and hard-red the moment the service is properly
retired (T900213 P2).

#### Scenario: probe list names FreeToken and LM Studio, not the proxy

- **GIVEN** the active (non-comment) lines of `scripts/llm/routing-check.sh`
- **WHEN** the probed URLs are collected
- **THEN** `127.0.0.1:1919` and `127.0.0.1:1234` are probed and `18235` is
  not probed

## ADDED Requirements

### Requirement: Routing check asserts the promised project default model is served

`scripts/llm/routing-check.sh` SHALL read the top-level `model` from
`.opencode/opencode.jsonc` as a third source of expected model IDs (after
`tickets.provider_config` and `autopilot.env`). Cloud-prefixed values are
skipped like cloud `base_url`s. When at least one local backend is reachable
and the promised (non-cloud) model ID is served by none of them, the check
SHALL fail (exit 1). The fail-soft rule (exit 0 when no local backend is
reachable at all) is unchanged.

Rationale: the T900189-class drift — the project default promises a model no
backend serves — is invisible to the DB-only and env-only sources. The
promise lives in `opencode.jsonc`; the check must close that loop, otherwise
the next backend cutover drifts silently again.

#### Scenario: promised model missing from all backends fails the check

- **GIVEN** at least one local backend answers and serves only other IDs
- **WHEN** the routing check runs with an `opencode.jsonc` default the
  backends do not serve
- **THEN** it reports the promised ID as FEHLT and exits 1

#### Scenario: promised model served passes

- **GIVEN** FreeToken on `:1919` serves `Qwen3.6-35B-A3B-NVFP4` and
  `opencode.jsonc` promises `llamacpp-local/Qwen3.6-35B-A3B-NVFP4`
- **WHEN** the routing check runs
- **THEN** the promise source reports no finding (suffix match on the model
  ID after the provider prefix)
