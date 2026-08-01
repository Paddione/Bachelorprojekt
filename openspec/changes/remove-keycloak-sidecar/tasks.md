---
title: "keycloak-MCP-Sidecar entfernen — Implementation Plan"
ticket_id: T002311
domains: [infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# keycloak-MCP-Sidecar entfernen — Implementation Plan

_Ticket: T002311_

## File Structure

```
CHANGED:
  k3d/default/claude-code-mcp-monolith-deploy.yaml   — keycloak-Container entfernen
  docs/agent-guide/secrets/deprecated.md              — KEYCLOAK_ADMIN_PASSWORD als DEPRECATED
```

## Partial Plan

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | remove-keycloak | impl | `k3d/default/claude-code-mcp-monolith-deploy.yaml` | — |
| p2 | verify | test | `tests/spec/remove-keycloak-sidecar.bats` | p1 |

### p1 — remove-keycloak

**Rolle:** impl — Container und Secret-Referenz entfernen

1. Restarts pro Container aufschlüsseln: `kubectl get pod -l app=claude-code-mcp-monolith -o jsonpath`
2. `keycloak`-Container aus dem Deployment YAML entfernen
3. Secret `KEYCLOAK_ADMIN_PASSWORD` in DEPRECATED-Doku aufnehmen
4. Rollout auslösen und Restarts auf 0 bestätigen

**Files:** `k3d/default/claude-code-mcp-monolith-deploy.yaml`

### p2 — verify

**Rolle:** test — Verifikation der Änderung

1. Test: Container existiert nicht mehr im Deployment
2. Test: Secret ist in deprecated.md gelistet
3. Test: Pod hat 0 Restarts nach Rollout

**Files:** `tests/spec/remove-keycloak-sidecar.bats`
