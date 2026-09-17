## Context

See `proposal.md` for motivation. The repository currently exposes several MCP transports on loopback: native Node HTTP servers, a local read-only PostgreSQL server, and port-forwards to third-party MCP servers in the fleet monolith. Their request boundaries differ: BGE requires a token, Factory and PostgreSQL do not, and the Kubernetes browser proxy deliberately removes the headers its upstream uses for CSRF protection.

The implementation must retain local CLI compatibility, keep browser access available to the llama Web UI, avoid plaintext secrets in tracked configuration, and protect both Windows and WSL start paths. MCP protocol modernization is intentionally separate.

## Goals / Non-Goals

**Goals:**

- Establish one fail-closed Host, Origin, CORS and bearer-token policy for repository-managed HTTP MCP entry points.
- Put security enforcement in front of every tool dispatcher and forwarded upstream.
- Preserve non-browser clients that legitimately omit `Origin`.
- Make policy behavior testable without a live cluster, database, browser or secret.
- Keep server-specific tokens out of tracked files and avoid cross-server token reuse.

**Non-Goals:**

- Implement MCP `2026-07-28`, OAuth discovery, or remote/public MCP serving.
- Change tool schemas, permissions inside Kubernetes, or PostgreSQL read-only enforcement.
- Use the security proxy as a general-purpose reverse proxy.
- Auto-generate or rotate secrets during normal server startup.

## Decisions

### D1: Shared zero-dependency HTTP security module

Create `scripts/lib/mcp-http-security.mjs` as the single implementation of:

- normalized `Host` validation against an explicit hostname allowlist;
- exact `Origin` parsing and allowlist matching;
- deterministic CORS response headers with `Vary: Origin`;
- bearer extraction and constant-time comparison using `node:crypto`;
- fail-fast validation of required environment configuration.

Native HTTP servers call this module directly. The existing proxy imports it before opening an upstream request. This avoids four subtly different security implementations while retaining the repository's zero-runtime-dependency pattern.

Rejected alternative: duplicate small guards in each server. The existing divergence demonstrates that duplicated transport policy does not stay aligned.

### D2: Validation order is Host, Origin, authentication, then body/dispatch

Every protected request follows this boundary:

```text
socket → Host guard → Origin guard → bearer guard → parse/route → tool or upstream
```

The proxy may remove Origin-related headers only after all three guards pass. Rejecting before body parsing and upstream creation keeps malformed or unauthorized payloads outside the application path and makes “not forwarded” directly testable.

Requests without `Origin` are treated as non-browser clients and proceed to authentication. A present malformed or foreign Origin is rejected; it is never silently treated as absent.

### D3: Exact browser origins, never wildcard or reflection

`MCP_BROWSER_ORIGINS` is a comma-separated list of complete origins such as `http://localhost:8098` and `http://127.0.0.1:8098`. Matching includes scheme, hostname and effective port. Allowed responses echo the already-validated exact origin and add `Vary: Origin`.

Allowed request headers are a fixed set needed by the supported MCP era: `Authorization`, `Content-Type`, `Accept`, `MCP-Protocol-Version`, `Mcp-Session-Id`, `Mcp-Method`, and `Mcp-Name`. Preflight input never expands this list.

Rejected alternative: hostname-only Origin matching. That would allow an unrelated service on another localhost port to drive MCP tools.

### D4: Server-specific bearer tokens

Use distinct environment variables:

| Surface | Variable |
|---|---|
| Factory MCP | `FACTORY_MCP_TOKEN` |
| BGE MCP | `BGE_MCP_TOKEN` (existing) |
| PostgreSQL MCP entry | `MCP_POSTGRES_TOKEN` |
| Kubernetes MCP entry/browser proxy | `MCP_KUBERNETES_TOKEN` |

The native servers and security proxies refuse startup when their variable is absent. Tokens are compared as byte buffers of equal length with `timingSafeEqual`; unequal lengths fail before comparison without revealing prefix information.

A token-free `/health` is allowed only as minimal liveness (`ok` and server name). Diagnostic details such as source hashes, backend state, database identity or cluster data remain authenticated.

Rejected alternative: one shared `LOCAL_MCP_TOKEN`. It reduces configuration but turns compromise of the lowest-impact endpoint into access to Factory, database and cluster surfaces.

### D5: Secure front proxy for third-party HTTP servers

Third-party monolith servers cannot all be patched consistently. Their port-forwards therefore bind to non-canonical loopback-only upstream ports. Instances of the repository proxy listen on the canonical registry ports, enforce D1–D4, and then forward to those private ports.

For Kubernetes, the existing browser port remains as a compatibility alias during migration, but it uses the same guard and token as the canonical endpoint. For PostgreSQL, upstream `--cors` is removed where practical; browser CORS exists only at the guarded proxy.

The proxy forwards a fixed header set and reconstructs `Host` for the upstream. Hop-by-hop headers and browser fetch metadata are discarded after validation.

### D6: Registry remains the configuration SSOT

`docs/agent-guide/registry/mcp.yaml` declares each Authorization header as `Bearer ${ENV_VAR}` and documents the corresponding local environment file. `scripts/mcp-sync.sh` continues translating references for harnesses that use a different placeholder syntax and resolves secrets only for already-untracked outputs where required.

Generated files are updated only through `task mcp:sync`. Tests use `MCP_OUT_DIR` fixtures so they do not mutate the real working tree.

### D7: Tests exercise behavior through real HTTP listeners

Tests start each native server or proxy on an ephemeral loopback port with fixture tokens and a recording upstream. They assert HTTP status, response headers, and whether the dispatcher/upstream was reached. Static grep assertions are insufficient for this boundary.

The common module also receives focused Node tests for malformed IPv6 Hosts, default ports, mixed-case headers, token length differences, multiple Origin headers and preflight header injection.

## Risks / Trade-offs

- **Existing clients lack the new tokens** → Update registry and environment provisioning before restarting canonical listeners; verify every harness with an initialize/tools-list probe.
- **Changing canonical port-forward topology can temporarily make MCP unavailable** → Stage guarded proxies on alternate ports, verify them, then switch registry/start scripts; retain a documented rollback to direct loopback forwarding.
- **Browser origin changes when the Web UI port changes** → Make the allowlist explicit and provide an actionable startup/check error rather than falling back to wildcard CORS.
- **Health monitors expect current diagnostic payloads without auth** → Keep only minimal liveness public and move detailed health to an authenticated route or authenticated MCP diagnostic tool.
- **A proxy bug could alter SSE or streaming behavior** → Preserve streaming with pipe-based forwarding and add a fixture that verifies response streaming and cancellation.

## Migration Plan

1. Add the common guard and behavioral tests without changing active ports.
2. Add server-specific token files/environment loading for Windows and WSL; generate random values outside the repository.
3. Apply the guard directly to Factory, BGE and local PostgreSQL implementations.
4. Start guarded proxy instances on temporary ports in front of Kubernetes and monolith PostgreSQL, then run authenticated CLI and browser-origin probes.
5. Update canonical port-forward mappings, registry headers and generated harness configuration in one cutover.
6. Run `task mcp:check`, focused BATS suites and live tools-list probes for every enabled HTTP server.
7. Roll back by restoring the previous port-forward mappings and registry commit; token files can remain unused for a retry.
