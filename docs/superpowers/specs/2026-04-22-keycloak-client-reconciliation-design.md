# Keycloak Client Reconciliation — Design Spec

**Date:** 2026-04-22
**Scope:** Make adding/recovering OIDC clients a declarative change (edit realm JSON → redeploy), without relying on a one-shot `kc.sh import --override false`.

---

## Problem

`k3d/realm-import-entrypoint.sh` runs `kc.sh import --override false` once at first pod start. After that, any client newly added to `realm-workspace-*.json` never enters the realm — the import is a no-op because the realm already exists. The only remediation today is wiping the Keycloak PVC, which destroys users/sessions. The existing `scripts/keycloak-sync-secrets.sh` can already write to live clients via the Admin API, but it only updates the `secret` field on clients that already exist.

## Decision Summary

| Question | Decision |
|---|---|
| Where does client shape live? | Realm JSON files (unchanged — single source of truth) |
| How do missing clients get created post-first-import? | Script reads clients from the live `realm-template` ConfigMap and POSTs any that are missing via Admin API |
| What about existing clients? | Only the `secret` field is reconciled (unchanged behavior) — redirect URIs, mappers, scopes, flags are NOT overwritten |
| Tooling? | Extend existing bash + curl + jq script; no Python/Go rewrite |
| Import entrypoint change? | None — keep `--override false` (first-boot bootstrap remains intact) |

---

## Architecture

### What changes

| Component | Role | Change |
|---|---|---|
| `k3d/realm-import-entrypoint.sh` | One-shot bootstrap: `kc.sh import --override false` | **Unchanged** — still the source of realm roles, scopes, mappers on a fresh DB |
| Realm JSON files (`realm-workspace-*.json`) | Authoritative client definitions | **Unchanged** — remain single source of truth for client shape |
| `scripts/keycloak-sync-secrets.sh` | Sets client secret via `PUT /clients/{uuid}` for existing clients | **Expand** to also `POST` missing clients. **Rename** → `scripts/keycloak-sync.sh` |
| `Taskfile.yml` task `keycloak:sync-secrets` | Invokes the script | **Rename** → `keycloak:sync`. Keep thin alias for old name |

### Net effect

Adding a new OIDC client becomes:
1. Add the client block to the appropriate `realm-workspace-*.json`.
2. Run `task workspace:deploy ENV=<env>` (already chains into `keycloak:sync`).

No PVC reset. No entrypoint changes. No realm re-import override.

---

## Client Source of Truth & Variable Substitution

The script reads clients **from the live `realm-template` ConfigMap on the target cluster**, not from the local git tree. This keeps it in lockstep with whatever the pod actually imports:

```bash
kubectl $CONTEXT_FLAG get cm realm-template -n workspace \
  -o jsonpath='{.data.realm-workspace\.json}' \
  | jq '.clients'
```

### Placeholder resolution

The extracted client JSON contains `${VAR}` placeholders (e.g. `${NC_DOMAIN}`, `${NEXTCLOUD_OIDC_SECRET}`). These are substituted from:

- **`configmap/domain-config`** — for domain vars (same keys the Keycloak pod sees via envFrom)
- **`secret/workspace-secrets`** — for OIDC secret vars (`*_OIDC_SECRET`)

Substitution is `sed`-driven with `|` delimiters, matching the style of `realm-import-entrypoint.sh:30` for consistency.

### Fail-hard sanity check

After substitution, grep for unresolved `${...}`. Any match is a hard error — same discipline as `realm-import-entrypoint.sh:35-39`. Rationale: if we silently POSTed a client with a literal `${NEXTCLOUD_OIDC_SECRET}` as its secret, auth would break exactly as it does today.

---

## Sync Algorithm

```
wait for deployment/keycloak rollout       (unchanged)
get admin token                            (unchanged)

extracted_clients = realm_template_configmap.clients[]

for each client in extracted_clients:
    substitute ${VAR} from domain-config + workspace-secrets
    fail if any ${...} remains

    existing = GET /admin/realms/workspace/clients?clientId={clientId}&search=false
    if existing empty:
        POST /admin/realms/workspace/clients  body=<substituted client JSON>
        log "created {clientId}"
        created++
    else:
        # keep existing behavior — only reconcile secret
        PUT /admin/realms/workspace/clients/{uuid}  body={"secret": "<value>"}
        log "secret-updated {clientId}"
        secret_updated++

print summary: created / secret_updated / skipped / failed
```

### What is explicitly NOT reconciled on existing clients

- `redirectUris`, `webOrigins`
- `protocolMappers`, `defaultClientScopes`, `optionalClientScopes`
- Role mappings
- Flags (`standardFlowEnabled`, `directAccessGrantsEnabled`, `publicClient`, etc.)

### Why presence-only for existing clients

Drift reconciliation would silently overwrite operator-applied fixes made through the Keycloak admin UI. Presence-only is the safer minimum: it unblocks the "new client missing" case without introducing a new class of silent overwrite. Creation-time field drift on already-existing clients is out of scope here — if it bites us, we'll scope a separate design for it.

---

## Diagnostic Phase — Dev Unblock (Before Touching Code)

Three read-only commands run against dev, no state change, to confirm the script's first run will do what we expect:

```bash
# 1. What does the ConfigMap say?
kubectl get cm realm-template -n workspace \
  -o jsonpath='{.data.realm-workspace\.json}' | jq '.clients[].clientId'

# 2. What's actually in the live realm?
PW=$(kubectl get secret workspace-secrets -n workspace \
  -o jsonpath='{.data.KEYCLOAK_ADMIN_PASSWORD}' | base64 -d)
kubectl exec deploy/keycloak -n workspace -- /opt/keycloak/bin/kcadm.sh \
  config credentials --server http://localhost:8080 --realm master \
  --user admin --password "$PW"
kubectl exec deploy/keycloak -n workspace -- /opt/keycloak/bin/kcadm.sh \
  get clients -r workspace --fields clientId

# 3. Evidence of the original single-shot import
kubectl logs deploy/keycloak -n workspace --tail=200 | grep -iE 'import|realm'
```

**Expected finding:** ConfigMap has 5 clients, live realm has 0–2. That confirms `--override false` + structural drift is the root cause. If the diagnostic shows something different (e.g. clients exist under different IDs, or ConfigMap is stale), revise the plan before coding.

**No PVC reset needed** — the new sync script's first run IS the fix.

---

## Testing Plan

| Step | Action | Pass criterion |
|---|---|---|
| 1 | Run diagnostic (above) on dev | Record baseline of present/missing clients |
| 2 | Implement script changes, run `task workspace:deploy ENV=dev` | All 5 clients present in realm |
| 3 | Verify each client's secret matches `workspace-secrets` | `kcadm.sh get clients/{uuid}/client-secret` matches decoded K8s secret |
| 4 | Regression: delete one client via admin UI, rerun `task keycloak:sync ENV=dev` | Deleted client is recreated, others untouched |
| 5 | Idempotency: run `task keycloak:sync ENV=dev` twice back-to-back | Second run reports all 5 as `secret-updated`, 0 `created`, 0 `failed` |

**Do NOT touch `mentolder` / `korczewski` in this PR.** Running the mechanism against live production clusters is a follow-up once dev is verified.

---

## Risk & Rollback

- **Scope of change:** one bash script + one Taskfile target rename. Revert = `git revert`.
- **Partial-failure semantics:** a `POST` that returns 4xx/5xx logs an error, increments `failed`, and continues to the next client. Admin API `POST /clients` is atomic — no half-written client records.
- **Auth-failure path:** unchanged from today (`keycloak-sync-secrets.sh:80-87`). If admin token can't be obtained, script exits 0 with a warning.
- **Admin API permissions:** master-realm admin has cross-realm write by default. Informally verified during the diagnostic — if the token can already `PUT` secrets today, it can `POST` clients.

---

## Out of Scope (Explicit)

- Fixing `prod-mentolder/realm-workspace-mentolder.json` to include the 3 missing clients — separate trivial PR once this mechanism lands.
- Reconciling non-secret fields of existing clients (drift correction on `redirectUris`, mappers, etc.).
- Switching to `kc.sh --partial-import-file` — considered, rejected: Admin API gives per-client granularity and we already have the token logic.
- Rewriting in Python / Go — bash + `jq` is enough.

---

## File-Level Change List

### Created

- None.

### Modified

- `scripts/keycloak-sync-secrets.sh` → renamed to `scripts/keycloak-sync.sh`; extended with ConfigMap read, `${VAR}` substitution, missing-client `POST` path, and updated summary counters.
- `Taskfile.yml`:
  - Rename task `keycloak:sync-secrets` → `keycloak:sync`; update the referenced script path.
  - Add thin alias `keycloak:sync-secrets` that calls `keycloak:sync` (back-compat for anything invoking the old name — drop in a follow-up once call sites are audited).
  - Update chained reference at `Taskfile.yml:1095` to call `keycloak:sync`.

### Deleted

- None (script is renamed, not deleted; git will track as rename).
