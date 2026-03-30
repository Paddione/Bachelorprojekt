## Summary

<!-- Describe WHAT changed and WHY (not how — the diff shows that). -->

## Type of Change

- [ ] Feature (`feature/*` branch)
- [ ] Bug fix (`fix/*` branch)
- [ ] Refactor / chore (`chore/*` branch)
- [ ] Documentation
- [ ] Infrastructure / k8s manifests

## Checklist

### Required for all PRs
- [ ] Branch follows naming convention (`feature/`, `fix/`, `chore/`)
- [ ] Changes are scoped to a single concern
- [ ] No secrets or credentials committed (dev secrets in `k3d/secrets.yaml` are OK)

### If modifying Kubernetes manifests (`k3d/`)
- [ ] `kubectl kustomize k3d/` succeeds locally
- [ ] Deployed to local k3d cluster and verified (`task homeoffice:deploy`)
- [ ] Resource requests/limits are set for new containers
- [ ] Health probes configured for new services
- [ ] No hardcoded hostnames — use `configMapKeyRef` from `domain-config`

### If modifying scripts (`scripts/`, `tests/`)
- [ ] `shellcheck` passes (warnings acceptable, errors are not)
- [ ] Tested on a clean environment

### If modifying authentication (Keycloak / OIDC)
- [ ] `k3d/realm-homeoffice-dev.json` updated if clients change
- [ ] SSO login tested for all affected services

## Requirements Traceability

> Every functional change must be traceable to a requirement in the tracking database.
> Use `task tracking:psql` to query requirements, or view them at `tracking.localhost`.

- [ ] **Checked** whether a matching requirement exists in the tracking DB (`bachelorprojekt.requirements`)
- [ ] **If no entry exists:** Added via `task tracking:psql` with category, name, description, acceptance_criteria, and test_cases

**Requirement ID:** <!-- e.g. FA-09, SA-08, NFA-08 -->

## Test Plan

> Tests must match the `test_cases` column of the requirement entry in the tracking DB.

**Tests implemented:**
- [ ] Test script added/updated in `tests/local/` (bash) or `tests/e2e/specs/` (Playwright)
- [ ] Each test case (T1, T2, ...) from the requirement is covered by an assertion
- [ ] Assertions use the correct requirement ID and test ID: `assert_* ... "REQ-ID" "T1" "description"`
- [ ] `./tests/runner.sh local <REQ-ID>` passes

## Screenshots / Logs

<!-- If applicable, paste output or screenshots -->
