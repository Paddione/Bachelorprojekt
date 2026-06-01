---
name: keycloak-realm-sync
description: Use when Keycloak realm configuration needs to be reconciled — OIDC client settings, realm JSON changes, group mappings, mapper configuration, or SSO login failures that stem from realm drift. Covers running keycloak:sync, post-sync verification, and testing SSO flows.
---

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

# keycloak-realm-sync

Reconcile Keycloak realm configuration from the checked-in realm JSON files. Covers both brands on the fleet cluster.

---

## When to use this skill

- SSO login is broken or redirecting to wrong URLs
- A new OIDC client was added/updated in the realm JSON and needs pushing
- Group memberships or attribute mappers are out of sync
- After a fresh workspace deploy (realm may not match the latest JSON)
- After Keycloak pod restart that cleared in-memory state

---

## Realm JSON locations

| Env | File |
|---|---|
| dev | `k3d/realm-workspace-dev.json` |
| mentolder | `prod-mentolder/realm-workspace-mentolder.json` |
| korczewski | `prod-korczewski/realm-workspace-korczewski.json` (applied to fleet cluster, namespace `workspace-korczewski`) |

**Never edit realm state directly in the Keycloak admin UI without also updating the JSON.** The sync overwrites UI changes that aren't in the JSON.

---

## Phase 1: Pre-sync check

```bash
# Confirm Keycloak is running and reachable
task workspace:status ENV=<env>
# Look for keycloak pod: 1/1 Running

# Tail Keycloak logs — watch for errors before touching realm config
task workspace:logs ENV=<env> -- keycloak
```

If Keycloak is not running, start it first:
```bash
task workspace:restart ENV=<env> -- keycloak
# Wait ~60s for startup
task workspace:logs ENV=<env> -- keycloak
# Wait for: "Keycloak X.Y.Z on JVM ... started"
```

---

## Phase 2: Edit realm JSON (if needed)

If you're making realm config changes (not just re-syncing):

1. Edit the appropriate realm JSON file
2. Key sections to know:

```json
// OIDC client — check redirectUris and webOrigins
"clients": [
  {
    "clientId": "website",
    "redirectUris": ["https://web.<domain>/*"],
    "webOrigins": ["https://web.<domain>"]
  }
]

// Protocol mappers — for passing user attributes to services
"protocolMappers": [...]

// Groups — for access control (e.g. /dev-access for dev cluster)
"groups": [...]

// Required actions / browser flows
"browserFlow": "browser"
```

3. Validate JSON syntax:
```bash
python3 -c "import json; json.load(open('prod-mentolder/realm-workspace-mentolder.json'))" && echo "valid"
```

---

## Phase 3: Run sync

```bash
task keycloak:sync ENV=mentolder
# For korczewski brand (on the fleet cluster):
task keycloak:sync ENV=korczewski
```

The sync script (`scripts/keycloak-sync.sh`) uses the Keycloak admin REST API to:
- Import/update the realm from the JSON file
- Reconcile clients, scopes, and mappers
- Apply role and group structure

Watch for errors in the output. Common failures:
| Error | Cause | Fix |
|---|---|---|
| `401 Unauthorized` | Admin credentials wrong or Keycloak not ready | Check `keycloak-admin` secret, wait for pod |
| `404 Not Found` on realm | Realm was deleted; full import needed | Check Keycloak admin UI |
| `409 Conflict` on client | Client already exists with conflicting ID | Update instead of create — check script logic |

---

## Phase 4: Ensure protocol mappers

```bash
bash scripts/keycloak-ensure-mappers.sh <env>
```

This applies any mapper definitions that `keycloak:sync` doesn't automatically handle (e.g. custom claim mappers for the website JWT). Run after every realm sync.

---

## Phase 5: Verify OIDC clients

For each service that uses SSO, confirm the client config is correct:

```bash
# List all clients
task workspace:psql ENV=<env> -- keycloak
```

Or use the Keycloak admin UI at `https://auth.<domain>/admin`:

| Service | Client ID | Check |
|---|---|---|
| Website | `website` | redirect URIs include `https://web.<domain>/*` |
| Nextcloud | `nextcloud` | redirect URIs, client secret matches `nextcloud-oidc-*.php` |
| Vaultwarden | `vaultwarden` | redirect URIs include `https://vault.<domain>/identity/connect/oidc-signin` |
| DocuSeal | `docuseal` | redirect URIs correct |
| Tracking | `tracking` | redirect URIs correct |
| Claude Code | `claude-code` | redirect URIs correct |
| Arena | `arena` | redirect URIs for both `web.mentolder.de` and `web.korczewski.de` |

---

## Phase 6: Test SSO flow

Verify login end-to-end for the most critical services:

```bash
# Use Playwright for automated SSO check
# Or manually:
# 1. Open https://web.<domain> in incognito
# 2. Click "Anmelden" / login
# 3. Verify redirect to auth.<domain>
# 4. Log in with test credentials
# 5. Verify redirect back and successful session
```

For Nextcloud specifically:
```bash
# Check OIDC config is mounted
kubectl exec -n <WORKSPACE_NS> --context <ctx> \
  deployment/nextcloud -- cat /var/www/html/config/oidc.php
```

---

## Phase 7: Check group memberships

If the sync changed group structure, verify that users still have the right memberships via Keycloak admin UI:
- `https://auth.<domain>/admin` → Users → select user → Groups tab

Key groups:
- `/dev-access` — required for dev.mentolder.de access (enforced by oauth2-proxy)
- Any custom groups for role-based access

---

## Common post-sync issues

**Website login loop after sync:**
- Usually wrong `redirectUris` or `webOrigins` in the `website` client
- Check CORS settings: `webOrigins` must include the website domain exactly

**Nextcloud OIDC error after sync:**
- The `nextcloud-oidc-*.php` file is applied as a ConfigMap — if its client secret was reset, re-seal and redeploy
- Check: `task workspace:logs ENV=<env> -- nextcloud | grep -i oidc`

**"Invalid client secret" from any service:**
- The client secret in the realm JSON may not match the service's SealedSecret
- Use `secret-rotation` skill to re-align

---

## Post-Execution: Mishap Report

After completing all steps in this skill, invoke `mishap-tracker` with your
accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits
cleanly with "No mishaps found."

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `secret-rotation` | Querschnitt — OIDC-Client-Secrets |
| `fleet-ops` | Querschnitt — Cross-Brand Realm-Sync |
| `mishap-tracker` | Abschluss — protokolliert Frictions |
