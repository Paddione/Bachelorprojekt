---
title: "t002205-keycloak-cleanup — Implementation Plan"
ticket_id: T002205
domains: [infra, security]
status: completed
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

### PP1: Remove realm-import scripts — DONE
- [x] Delete `scripts/import-entrypoint.sh` and `prod/import-entrypoint.sh`
- [x] Remove ConfigMap mount from `k3d/deploy.sh` (plus dead `keycloak` rollout-wait
      and Keycloak-Admin-Konsole banner → Pocket ID)
- [x] Clean up `k3d/kustomization.yaml`, `prod/kustomization.yaml`,
      `prod-mentolder|prod-korczewski|prod-fleet/staging/kustomization.yaml`
- [x] Drop the dead `keycloak-db` alias Service from `k3d/shared-db.yaml`

### PP2: Remove KEYCLOAK_DB_PASSWORD — DONE
- [x] `environments/schema.yaml`: key was already gone; tombstone comment updated,
      `DEV_WORKSPACE_OIDC_SECRET` description de-Keycloaked
- [x] Remove `KEYCLOAK_DB_PASSWORD` + `KEYCLOAK_ADMIN_PASSWORD` from
      `environments/.secrets/{mentolder,korczewski,fleet-mentolder,fleet-korczewski,staging}.yaml`
- [x] Re-seal all five envs → `environments/sealed-secrets/*.yaml`
- [x] `task env:validate ENV=mentolder|korczewski` green
- [x] Drop the `keycloak` backup/restore target from `scripts/backup-restore{,-lib,-db}.sh`

### PP3: Clean up docs — DONE
- [x] Delete `docs/legacy-html/keycloak.html`
- [x] `troubleshooting.html`: Keycloak/SSO section → Pocket ID; `keycloak-sync.sh` block dropped
- [x] `scripts.html`: `import-entrypoint.sh` + `keycloak-sync.sh` sections dropped, TOC renumbered
- [x] `glossary.html`: dangling `keycloak` link + Keycloak wording → Pocket ID
- Out of scope: `k3d/docs-content-built/` is rebuilt by `build-docs.yml` on `docs/**` push.

### PP4: Verify infra — DONE
- [x] `task workspace:validate` green
- [x] Postgres cleanup on `fleet`: `keycloak` role dropped in `workspace` and
      `workspace-korczewski`; `keycloak` DB (13 MB) + role dropped in `workspace-staging`
- [x] Orphaned cluster objects removed in all three namespaces: `service/keycloak`,
      `service/keycloak-db`, `configmap/keycloak-import-script`, plus a still-running
      `deployment/keycloak` (35 d old) in `workspace-staging`

## Follow-ups (not in this change)
- `scripts/admin-users-setup.sh` + `scripts/import-users.sh` are Keycloak-era user
  provisioners still wired into `Taskfile.yml` (`workspace:admin-users-setup`,
  `:all-prods`) and `scripts/verify-deployment.sh`. Removing them touches the
  `KC_USER*` schema vars and setup docs — separate ticket.
- `openspec/specs/{secret-rotation,workspace-deploy}.md` and `tests/unit/scripts.bats`
  use `KEYCLOAK_DB_PASSWORD` purely as an arbitrary fixture key; renaming is cosmetic.
