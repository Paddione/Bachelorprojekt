# Proposal: Korczewski monolith — hybrid Keycloak + token auth (T000973 parity)

_Ticket: T001022_

## Why

T000973 (mentolder-only, PR #1926) hardened the mentolder `claude-code-mcp-*` deployments
with Keycloak `CLIENT_CREDENTIALS` + NetworkPolicy. T000975 (PR #1939) consolidated the
korczewski namespace to a single `claude-code-mcp-monolith` pod, but in doing so deleted
`k3d/claude-code-mcp-auth.yaml` — leaving the korczewski monolith with only token-based
auth (`mcp-auth-proxy` validates `CLUSTER_TOKEN` + `BUSINESS_TOKEN` from `mcp-tokens`)
and **no** Keycloak integration.

This is a security asymmetry: mentolder has Keycloak auth, korczewski does not. Human
users hitting the korczewski monolith have no OIDC-backed identity — only a shared
cluster token. T001022 is the follow-up that closes the gap with a hybrid auth model
that keeps service-to-service tokens working and adds Keycloak for human users.

**User decisions (2026-06-21):**
- **Auth model:** Hybrid — Keycloak for human users, token-based (`CLUSTER_TOKEN` /
  `BUSINESS_TOKEN` via `mcp-auth-proxy`) for service-to-service. Preserves existing
  automation. Keycloak path follows T000973's `CLIENT_CREDENTIALS` pattern.
- **NetworkPolicy:** Keep current broad policies. No NetworkPolicy change in this PR
  (deferred to a follow-up; explicitly documented in the security-spec delta).
- **SealedSecret:** Per-brand (current pattern). Add Keycloak entries to
  `environments/sealed-secrets/korczewski.yaml`.

## What

### 1. Add Keycloak client credentials to korczewski SealedSecret

Append a new `SealedSecret` (or extend the existing `workspace-secrets` in
`environments/sealed-secrets/korczewski.yaml`) with these keys:

- `MCP_KEYCLOAK_CLIENT_ID` — dedicated Keycloak client for the korczewski monolith
  (e.g. `claude-code-mcp-monolith`). Created via `keycloak-realm-sync` workflow.
- `MCP_KEYCLOAK_CLIENT_SECRET` — generated during the realm-sync run, sealed into
  the brand-local SealedSecret.
- `MCP_KEYCLOAK_REALM_URL` — `https://keycloak.korczewski.de/realms/workspace`
  (resolved at deploy via `kustomize` `configMapGenerator` + `envsubst`).

> **Why per-brand:** each brand runs its own Keycloak realm in this architecture
> (mentolder realm, korczewski realm). Sharing the sealed secret across brands
> would leak one realm's client secret to the other. Per-brand isolation is the
> existing convention (cf. `mentolder-mcp-keycloak-secret.yaml` from T000973).

### 2. Surface Keycloak env vars on the monolith (config only, not consumed yet)

Update `k3d/claude-code-config.yaml` (the brand-shared `claude-code-config` ConfigMap)
to include the new Keycloak values. The monolith container does **not** read these
directly; they are surfaced for the new `mcp-keycloak-sidecar` (next bullet) and for
operator visibility.

```yaml
MCP_KEYCLOAK_CLIENT_ID: "<from workspace-secrets.korczewski>"
MCP_KEYCLOAK_REALM_URL: "https://keycloak.korczewski.de/realms/workspace"
MCP_KEYCLOAK_AUDIENCE: "claude-code-mcp-monolith"
```

### 3. Add `mcp-keycloak-sidecar` to the `mcp-auth-proxy` Deployment

The `mcp-auth-proxy` deployment (currently a single `nginx:1.27-alpine-perl` container
validating `CLUSTER_TOKEN` / `BUSINESS_TOKEN` via nginx) gets a second sidecar
container that:

- Runs `quay.io/oauth2-proxy/oauth2-proxy:v7.6.0` (image already in cluster registry).
- Validates Keycloak JWT for inbound requests on a new path prefix
  (`/keycloak-auth/*`).
- On success, injects `X-Forwarded-User` and `X-Forwarded-Email` headers and
  forwards to the monolith via `http://claude-code-mcp-monolith:8080`.

The two sidecars share the same `mcp-auth-proxy` Service (port 80) — routing is done
in the nginx config (existing) by `location` match:
- `location /svc/ { proxy_pass http://claude-code-mcp-monolith:8080; }` (existing,
  token-validated)
- `location /user/ { proxy_pass http://localhost:4180/; }` (new, Keycloak-validated
  via sidecar on port 4180)

The monolith now has **two** ingress paths: `/svc/*` (service-to-service, tokens)
and `/user/*` (human users, Keycloak JWT). Both terminate at the monolith on the
same internal port. The monolith's own auth code (when implemented in a follow-up)
can distinguish by inspecting the `X-Forwarded-User` header presence.

### 4. Update `k3d/ingress.yaml` to expose the user-path subroute

Add a path-prefix rule on the existing Ingress that routes
`/api/mcp/user(/|$)(.*)` → `mcp-auth-proxy.korczewski.svc.cluster.local:80` with
the Keycloak cookie-based session attached. This is a thin shim — the actual
Keycloak session is owned by the sidecar.

### 5. Document the asymmetry → parity in `openspec/specs/security.md`

Append a new "Hybrid auth model — korczewski monolith" section to the security spec
capturing:

- Decision matrix: who gets which auth (service / automation / human).
- Why no NetworkPolicy change this round (deferred; tracked as a follow-up).
- Cross-link to T000973 (mentolder) and T000975 (consolidation) for the lineage.
- Operational runbook: how to rotate `MCP_KEYCLOAK_CLIENT_SECRET`
  (`task secret-rotation:rotate ENV=korczewski TARGET=mcp-keycloak`).

### GIVEN / WHEN / THEN

**GIVEN** a human user with a valid Keycloak session cookie for the korczewski realm  
**WHEN** they issue `POST https://mcp.korczewski.de/api/mcp/user/query` with a JSON-RPC
payload  
**THEN** the request hits `mcp-auth-proxy` → `oauth2-proxy` sidecar validates the JWT
against `MCP_KEYCLOAK_REALM_URL`, injects `X-Forwarded-User` + `X-Forwarded-Email`,
and forwards to the monolith; the monolith logs the user identity.

**GIVEN** an automation service (e.g. `knowledge-ingest` cronjob) with a
`CLUSTER_TOKEN` or `BUSINESS_TOKEN`  
**WHEN** it issues `POST https://mcp.korczewski.de/api/mcp/svc/query` with
`Authorization: Bearer <token>`  
**THEN** the existing nginx `auth_request` validates the token, the request
proceeds to the monolith unchanged. No Keycloak round-trip; latency unaffected.

**GIVEN** the `MCP_KEYCLOAK_CLIENT_SECRET` is rotated via
`task secret-rotation:rotate ENV=korczewski TARGET=mcp-keycloak`  
**WHEN** the SealedSecret is regenerated and applied  
**THEN** the `mcp-auth-proxy` Deployment picks up the new secret on its next
rollout (or via a manual `kubectl rollout restart deploy/mcp-auth-proxy`); no
human-user sessions are invalidated (they hold Keycloak session cookies, not
client-secret-bound JWTs).

## Out of scope (deferred)

- NetworkPolicy hardening (user explicitly deferred; tracked as a follow-up).
- Monolith-side auth code that inspects `X-Forwarded-User` (separate ticket —
  the monolith is a passthrough today; this PR only adds the proxy layer).
- Per-tool authorization matrix (which MCP server can be called by which user role).
- Cross-brand key sharing (explicitly rejected by user).
