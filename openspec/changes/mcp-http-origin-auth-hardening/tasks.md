## 1. Shared HTTP security boundary

- [ ] 1.1 Add failing behavioral tests in `tests/spec/mcp-gateway/http-security-boundary.bats` for allowed no-Origin CLI requests, exact allowed browser origins, foreign/malformed Origins, invalid Hosts, fixed preflight headers, missing tokens, wrong tokens and unequal-length tokens; verify the new suite fails against the current implementation.
- [ ] 1.2 Implement `scripts/lib/mcp-http-security.mjs` with fail-fast environment validation, localhost Host validation, exact Origin allowlisting, fixed CORS headers and constant-time bearer verification; verify the focused Node/BATS tests from 1.1 pass.
- [ ] 1.3 Add negative tests proving a rejected request is stopped before body parsing or dispatcher invocation; verify fixture counters remain zero for every 401/403 case.

## 2. Native HTTP MCP servers

- [ ] 2.1 Integrate the shared guard into `scripts/factory-mcp-node/server.mjs`, require `FACTORY_MCP_TOKEN` for `/mcp`, and reduce unauthenticated `/health` to minimal liveness; verify authenticated tools/list succeeds while missing token, foreign Origin and invalid Host fail before dispatch.
- [ ] 2.2 Integrate the shared Host/Origin/CORS policy into `scripts/bge-mcp/server.mjs` while preserving `BGE_MCP_TOKEN` authentication and POST-only MCP behavior; verify existing BGE tests plus the new security scenarios pass.
- [ ] 2.3 Integrate the shared guard into `scripts/mcp-gateway/mcp-postgres-local.mjs`, require `MCP_POSTGRES_TOKEN` for `/mcp`, and preserve read-only SQL enforcement; verify authenticated queries work and rejected requests never acquire a database connection.
- [ ] 2.4 Add startup-failure tests for all three native servers with absent or empty required token variables; verify each exits non-zero without binding its configured port.

## 3. Guarded monolith proxies and port topology

- [ ] 3.1 Refactor `scripts/mcp-cors-proxy/proxy.mjs` into a guarded MCP reverse proxy using the shared module, a fixed forwarded-header allowlist and server-specific token configuration; verify an in-process recording upstream receives nothing from rejected requests.
- [ ] 3.2 Add streaming/cancellation coverage in `tests/spec/mcp-gateway/guarded-proxy-streaming.bats`; verify authenticated SSE bytes stream without buffering and client disconnect closes the upstream request.
- [ ] 3.3 Update `scripts/mcp-gateway/mcp-gateway.service` and `scripts/mcp-gateway/start-windows.ps1` so monolith port-forwards bind only on non-canonical loopback upstream ports and guarded proxies own the canonical Kubernetes/PostgreSQL endpoints; verify rendered commands contain no unguarded canonical listener.
- [ ] 3.4 Preserve the Kubernetes browser endpoint as a guarded compatibility alias and remove direct wildcard-CORS exposure from the PostgreSQL path where supported; verify both CLI and allowed llama-Web-UI probes reach tools/list only with their correct tokens.

## 4. Registry, secret loading and documentation

- [ ] 4.1 Add server-specific Authorization references and browser-origin policy notes to `docs/agent-guide/registry/mcp.yaml`, then update `scripts/mcp-sync.sh` rendering as needed; verify tracked outputs contain environment placeholders and `task mcp:check` passes after regeneration.
- [ ] 4.2 Extend Windows and WSL service/startup configuration to load `FACTORY_MCP_TOKEN`, `MCP_POSTGRES_TOKEN`, `MCP_KUBERNETES_TOKEN` and `MCP_BROWSER_ORIGINS` from owner-readable untracked environment files; verify startup fails with an actionable message when any required value is absent.
- [ ] 4.3 Add `docs/runbooks/mcp-http-local-security.md` documenting token generation, allowed-origin configuration, cutover probes, rotation and rollback; verify no example contains a usable secret or recommends wildcard CORS.
- [ ] 4.4 Extend `tests/spec/mcp-gateway/mcp-sync-drift-no-secret-leak.bats` and related header-generation tests for all protected servers; verify server-specific tokens cannot authorize another endpoint and plaintext fixtures never enter tracked outputs.

## 5. Cutover and final verification

- [ ] 5.1 Start guarded endpoints on temporary ports and run authenticated initialize/tools-list plus allowed-browser-origin probes for Factory, BGE, PostgreSQL and Kubernetes; record the successful commands and results in the runbook before changing canonical ports.
- [ ] 5.2 Switch canonical listeners and generated client configurations, restart only the affected local services, and verify each enabled harness can list tools while unauthenticated and foreign-Origin requests receive 401/403.
- [ ] 5.3 Run `task mcp:check`, the recursive `tests/spec/mcp-gateway/` BATS suite, `task test:changed`, `task freshness:check` and `task workspace:validate`; verify every gate passes without modifying unrelated tracked artifacts.
