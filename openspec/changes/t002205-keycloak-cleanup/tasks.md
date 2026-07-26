---
title: "t002205-keycloak-cleanup — Implementation Plan"
ticket_id: T002205
domains: [infra, security]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t002205-keycloak-cleanup — Implementation Plan

## File Structure

```
scripts/import-entrypoint.sh                    (deleted — realm-import script)
prod/import-entrypoint.sh                       (deleted — realm-import script)
k3d/deploy.sh                                    (changed — remove ConfigMap mount)
k3d/kustomization.yaml                           (changed — remove ConfigMap ref)
environments/schema.yaml                         (changed — remove KEYCLOAK_DB_PASSWORD)
environments/.secrets/mentolder.yaml             (changed — remove KEYCLOAK_DB_PASSWORD)
environments/.secrets/korczewski.yaml            (changed — remove KEYCLOAK_DB_PASSWORD if present)
docs/legacy-html/keycloak.html                   (deleted)
docs/legacy-html/troubleshooting.html            (changed — remove Keycloak refs)
docs/legacy-html/scripts.html                    (changed — remove Keycloak refs)
```

## Partial Plans

### PP1: Remove realm-import scripts
- Delete `scripts/import-entrypoint.sh` and `prod/import-entrypoint.sh`
- Remove ConfigMap mount from `k3d/deploy.sh`
- Clean up `k3d/kustomization.yaml`

### PP2: Remove KEYCLOAK_DB_PASSWORD
- Remove from `environments/schema.yaml`
- Remove from secret files
- Run `task env:validate` for both brands

### PP3: Clean up docs
- Delete `docs/legacy-html/keycloak.html`
- Update other docs

### PP4: Verify infra
- Check for lingering `keycloak` DB role/table
- `task workspace:validate` green
