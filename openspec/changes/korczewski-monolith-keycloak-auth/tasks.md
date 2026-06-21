---
title: "Korczewski monolith: hybrid Keycloak + token auth (T000973 parity)"
ticket_id: T001022
domains: [security, infra]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Korczewski monolith — hybrid Keycloak + token auth — Implementation Plan

Implements the hybrid auth model for the korczewski `claude-code-mcp-monolith`:
- **Service-to-service:** existing `mcp-auth-proxy` nginx validates `CLUSTER_TOKEN`
  / `BUSINESS_TOKEN` (unchanged).
- **Human users:** new `oauth2-proxy` sidecar in the same `mcp-auth-proxy` Deployment
  validates Keycloak JWTs from the korczewski realm.
- **Per-brand SealedSecret:** new `MCP_KEYCLOAK_CLIENT_*` entries added to
  `environments/sealed-secrets/korczewski.yaml`.
- **No NetworkPolicy change** in this PR (deferred per user decision 2026-06-21).

---

## File Structure

```
k3d/claude-code-config.yaml                                 ← MODIFY: add 3 Keycloak env entries
k3d/claude-code-mcp-auth-proxy.yaml                        ← NEW: extracted mcp-auth-proxy Deployment + sidecar
k3d/ingress.yaml                                           ← MODIFY: add /api/mcp/user path route
environments/sealed-secrets/korczewski.yaml                ← MODIFY: add MCP_KEYCLOAK_* keys
openspec/specs/security.md                                  ← MODIFY: add "Hybrid auth model" section
```

---

## Aufgabe 1: Extract `mcp-auth-proxy` Deployment to its own manifest

**Why:** The Deployment currently lives as `k3d/claude-code-mcp-auth-proxy.yaml`
in the cluster but has no committed file. Pulling it into git makes the change
auditable.

**Dateien:** `k3d/claude-code-mcp-auth-proxy.yaml` (NEU)

**Schritte:**
1. `kubectl --context fleet get deploy mcp-auth-proxy -n workspace-korczewski -o yaml > /tmp/mcp-auth-proxy.yaml`
2. Strip `status:`, `metadata.resourceVersion`, `metadata.uid`, `metadata.generation`,
   `metadata.creationTimestamp`, `metadata.managedFields` (sync-noise).
3. Move the inlined `nginx.conf` (currently in the `mcp-auth-proxy-config` ConfigMap)
   to a separate `k3d/mcp-auth-proxy-nginx.conf` file referenced via `subPath: nginx.conf`.
4. Register in `k3d/kustomization.yaml`.

**Akzeptanz:**
- `kubectl --context fleet apply --dry-run=client -k k3d/` is clean.
- After commit, the live Deployment is byte-equivalent (modulo sync-noise).

**Vorab-Test (TDD, rot):** Vor dieser Änderung existiert die Datei `k3d/claude-code-mcp-auth-proxy.yaml` NICHT im Repo. Verifiziere mit `test -f k3d/claude-code-mcp-auth-proxy.yaml && echo EXISTS || echo MISSING` — expected fail with output `MISSING` before extraction. Nach der Extraktion: `EXISTS` (test passes).

---

## Aufgabe 2: Add `oauth2-proxy` sidecar to `mcp-auth-proxy`

**Dateien:** `k3d/claude-code-mcp-auth-proxy.yaml`

**Schritte:**
- Add a second container `oauth2-proxy` to the existing Deployment spec, image
  `quay.io/oauth2-proxy/oauth2-proxy:v7.6.0`, port 4180.
- Mount the new `mcp-keycloak-proxy-config` ConfigMap (next bullet) at
  `/etc/oauth2-proxy/`.
- Add env vars: `OAUTH2_PROXY_CLIENT_ID`, `OAUTH2_PROXY_CLIENT_SECRET`,
  `OAUTH2_PROXY_COOKIE_SECRET` (all from `mcp-tokens` sealed-secret or a new
  `mcp-keycloak-secret`).
- Add `livenessProbe` on `/ping` (oauth2-proxy convention).

**Akzeptanz:**
- `kubectl --context fleet rollout restart deploy/mcp-auth-proxy -n workspace-korczewski`
  after apply, both containers `Ready`.

---

## Aufgabe 3: Add `mcp-keycloak-proxy-config` ConfigMap

**Dateien:** `k3d/claude-code-mcp-auth-proxy.yaml` (add ConfigMap next to Deployment)

**Inhalt (template):**
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: mcp-keycloak-proxy-config
  labels: { app: claude-code }
data:
  oauth2-proxy.cfg: |
    provider = "keycloak-oidc"
    client_id = "claude-code-mcp-monolith"
    client_secret = ""
    cookie_name = "mcp_kc_session"
    cookie_secure = true
    cookie_httponly = true
    cookie_samesite = "lax"
    email_domains = [ "*" ]
    upstreams = [ "http://localhost:80" ]
    skip_auth_regex = [ "^/svc/" ]   # token-validated path bypasses oauth2-proxy
    scope = "openid email profile"
    oidc_issuer_url = "https://keycloak.korczewski.de/realms/workspace"
    redirect_url = "https://mcp.korczewski.de/oauth2/callback"
    pass_access_token = true
    set_xauthrequest = true
    set_authorization_header = true
    pass_user_headers = true
```

> `skip_auth_regex` is critical: it routes the existing `/svc/*` token-validated
> requests around the oauth2-proxy entirely. Only `/user/*` (and the oauth2
> callback) hit the oauth2-proxy path.

**Akzeptanz:**
- `kubectl --context fleet get configmap mcp-keycloak-proxy-config -n workspace-korczewski -o yaml`
  returns the same content as the file.

---

## Aufgabe 4: Add `MCP_KEYCLOAK_*` entries to korczewski SealedSecret

**Dateien:** `environments/sealed-secrets/korczewski.yaml`

**Schritte:**
1. Generate `MCP_KEYCLOAK_CLIENT_SECRET` (use a 48-byte base64 random — same
   generator as other client secrets in this repo).
2. `bash scripts/env-seal.sh --env korczewski --env-dir environments` to re-seal.
3. Verify the SealedSecret contains 3 new keys:
   - `MCP_KEYCLOAK_CLIENT_ID` = `claude-code-mcp-monolith`
   - `MCP_KEYCLOAK_CLIENT_SECRET` = `<generated>`
   - `MCP_KEYCLOAK_REALM_URL` = `https://keycloak.korczewski.de/realms/workspace`

**Akzeptanz:**
- `task env:seal ENV=korczewski` re-seals the file with 0 new violations.
- `kubectl --context fleet get secret workspace-secrets -n workspace-korczewski -o jsonpath='{.data.MCP_KEYCLOAK_CLIENT_ID}' | base64 -d` returns the expected client id.

---

## Aufgabe 5: Update `k3d/claude-code-config.yaml` with Keycloak metadata

**Dateien:** `k3d/claude-code-config.yaml`

**Hinzufügen** (the `data:` section):
```yaml
MCP_KEYCLOAK_CLIENT_ID: "claude-code-mcp-monolith"
MCP_KEYCLOAK_REALM_URL: "https://keycloak.korczewski.de/realms/workspace"
MCP_KEYCLOAK_AUDIENCE: "claude-code-mcp-monolith"
```

**Akzeptanz:**
- `kubectl --context fleet rollout restart deploy claude-code-mcp-monolith -n workspace-korczewski`
  picks up the new env vars on the next pod start.

---

## Aufgabe 6: Add `/api/mcp/user` Ingress route

**Dateien:** `k3d/ingress.yaml`

**Hinzufügen** (or modify the existing `mcp.korczewski.de` host block):
```yaml
- path: /api/mcp/user
  pathType: Prefix
  backend:
    service:
      name: mcp-auth-proxy
      port: { number: 80 }
- path: /oauth2
  pathType: Prefix
  backend:
    service:
      name: mcp-auth-proxy
      port: { number: 80 }
```

**Akzeptanz:**
- `curl -I https://mcp.korczewski.de/api/mcp/user/healthz` (no session) returns
  `302` to Keycloak login.
- `curl -I https://mcp.korczewski.de/api/mcp/svc/healthz` (with `Authorization:
  Bearer <BUSINESS_TOKEN>`) returns `200`.

---

## Aufgabe 7: Update `openspec/specs/security.md`

**Dateien:** `openspec/specs/security.md`

**Hinzufügen** (neue Sektion am Ende):
```markdown
## Hybrid auth model — korczewski monolith (T001022)

### Decision matrix
| Caller | Auth | Path |
|---|---|---|
| Automation / cronjob | `BUSINESS_TOKEN` or `CLUSTER_TOKEN` | `/api/mcp/svc/*` |
| Human user (browser) | Keycloak OIDC (cookie session) | `/api/mcp/user/*` |

### Why no NetworkPolicy change in this PR
User decision (2026-06-21): NetworkPolicy hardening deferred to a follow-up
ticket. Current `allow-internet-egress` + `allow-egress-to-workspace` etc. remain.

### Operational runbook
Rotate `MCP_KEYCLOAK_CLIENT_SECRET`:
  `task secret-rotation:rotate ENV=korczewski TARGET=mcp-keycloak`
Then `kubectl --context fleet rollout restart deploy/mcp-auth-proxy -n workspace-korczewski`.

### Lineage
- T000973 (PR #1926) — mentolder hardening
- T000975 (PR #1939) — korczewski consolidation
- T001022 (this PR) — hybrid auth parity
```

**Akzeptanz:**
- `bash scripts/openspec.sh validate spec security` exits 0.

---

## Aufgabe 8: Verifikation

```bash
# 1. Kustomize dry-run
task workspace:validate

# 2. Apply to dev cluster (k3d), smoke test
task workspace:deploy ENV=dev
# Wait for rollout, then:
curl -I https://mcp.dev.localhost/api/mcp/svc/healthz -H "Authorization: Bearer $BUSINESS_TOKEN"
# expect 200

# 3. Human path (no session → redirect to keycloak)
curl -I https://mcp.dev.localhost/api/mcp/user/healthz
# expect 302 with Location pointing to keycloak

# 4. After keycloak login, replay:
curl -I https://mcp.dev.localhost/api/mcp/user/healthz -H "Cookie: mcp_kc_session=..."
# expect 200

# 5. Freshness + tests
task freshness:regenerate
task freshness:check
task test:changed

# 6. Apply to fleet (prod)
task workspace:deploy ENV=korczewski
# Verify korczewski pods Ready, no rollout loops
```

**Akzeptanz:**
- All 4 curl assertions match.
- `task workspace:validate` and `task test:changed` are clean.
- `task freshness:check` is clean (no new baselined lines).
- `task workspace:deploy ENV=korczewski` completes without errors.

---

## Implementierungsreihenfolge

1. Aufgabe 1 (manifest extraction) — pure gitops hygiene, low-risk
2. Aufgabe 3 (ConfigMap) — pre-req for sidecar
3. Aufgabe 2 (sidecar) — depends on 1+3
4. Aufgabe 4 (SealedSecret) — can run parallel to 1-3
5. Aufgabe 5 (ConfigMap env) — after 4
6. Aufgabe 6 (Ingress) — after 2
7. Aufgabe 7 (spec update) — last
8. Aufgabe 8 (verify) — gates merge

---

## Known footguns (T001022-specific)

- **The `oauth2-proxy` sidecar shares the `mcp-auth-proxy` Service port (80)** —
  traffic routing is by `location` match in nginx, not by separate Services.
  Do **not** add a second Service; that would break the existing `/svc/*` path.
- **`MCP_KEYCLOAK_CLIENT_SECRET` must be per-brand** — sharing would leak the
  korczewski realm secret to mentolder. The `keycloak-realm-sync` workflow
  generates per-brand clients.
- **No NetworkPolicy change** — explicit user decision. A follow-up ticket
  should pick up egress tightening (replace `allow-internet-egress` with an
  allowlist of keycloak + shared-db + DNS).
- **oauth2-proxy version pinning** — `v7.6.0` is the LTS release used elsewhere
  in this repo (cf. `k3d/oauth2-proxy-*.yaml`). Don't bump without testing
  realm-rotation compatibility.
- **Cookie name collision** — use `mcp_kc_session`, not `_oauth2_proxy` (the
  default). The repo's other Keycloak-fronted services already use
  brand-prefixed cookie names to avoid cross-service collisions.
