# Proposal: t002205-keycloak-cleanup

## Why

Keycloak was decommissioned in favor of Pocket ID, but supporting scripts and config remain:
1. Realm-import scripts exist and are still wired into the deploy pipeline
2. `KEYCLOAK_DB_PASSWORD` is still in the schema and secrets
3. Various documentation references to Keycloak remain

## Changes

### 1. Remove realm-import scripts from deploy
- Delete `scripts/import-entrypoint.sh` and `prod/import-entrypoint.sh`
- Remove ConfigMap mount of `scripts/import-entrypoint.sh` from `k3d/deploy.sh`
- Clean up related ConfigMap references in `k3d/kustomization.yaml`

### 2. Remove KEYCLOAK_DB_PASSWORD
- Remove from `environments/schema.yaml`
- Remove from `environments/.secrets/mentolder.yaml` and `korczewski.yaml` (if present)
- Verify `task env:validate` passes for both brands
- Verify `task env:seal` runs through

### 3. Clean up docs
- Remove `docs/legacy-html/keycloak.html`
- Update `docs/legacy-html/troubleshooting.html` and `scripts.html`

### 4. Verify infrastructure
- Check if `keycloak` DB/role still exists in PostgreSQL
- If so, plan removal or document deferral

## Trade-offs
- Removing schema entries affects env:validate. Must test both brands.

## Risks
- Keycloak DB password removal in secrets must be done carefully. If a DB role still exists,
  the password should be removed only after the role is dropped.
