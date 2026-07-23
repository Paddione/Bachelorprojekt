## ADDED Requirements

### Requirement: REQ-LLMPROXY-INFLIGHT-001 — Konfigurierbare per-Backend-Parallelität

Der llm-proxy (`scripts/llm-proxy/server.mjs`) SHALL die strikte
1-Request-FIFO-Serialisierung pro Backend durch ein Semaphor ersetzen, dessen Limit aus
der neuen Spalte `tickets.llm_proxy_backends.max_inflight` (integer NOT NULL DEFAULT 1)
stammt. Mit `max_inflight=1` SHALL das Verhalten identisch zu heute sein.
`/admin/state` SHALL pro Backend `inflight` und `max_inflight` ausweisen. `/health`
bleibt unverändert; Gang-Gating-Clients SHALL `/admin/state` verwenden.

#### Scenario: Default keeps today's serialization

- **GIVEN** a backend row with `max_inflight=1`
- **WHEN** two requests for that backend arrive concurrently
- **THEN** the second request waits until the first completes (FIFO order preserved)

#### Scenario: Raising max_inflight enables real concurrency without code changes

- **GIVEN** `max_inflight=4` for backend `llamacpp-bonsai` and a restarted/refreshed proxy
- **WHEN** four bonsai subagent requests arrive concurrently
- **THEN** all four are in flight simultaneously and `/admin/state` reports `inflight=4, max_inflight=4`
