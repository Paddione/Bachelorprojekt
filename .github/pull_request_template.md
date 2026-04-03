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
- [ ] Deployed to local k3d cluster and verified (`task workspace:deploy`)
- [ ] Resource requests/limits are set for new containers
- [ ] Health probes configured for new services
- [ ] No hardcoded hostnames — use `configMapKeyRef` from `domain-config`

### If modifying scripts (`scripts/`, `tests/`)
- [ ] `shellcheck` passes (warnings acceptable, errors are not)
- [ ] Tested on a clean environment

### If modifying authentication (Keycloak / OIDC)
- [ ] `k3d/realm-workspace-dev.json` updated if clients change
- [ ] SSO login tested for all affected services

### Tracking Database Update (mandatory)
- [ ] **Pipeline status updated** in tracking DB for affected requirement(s)
  - Via Tracking UI (http://tracking.localhost), `task tracking:psql`, or PostgreSQL MCP
  - Updated stage (`idea` / `implementation` / `testing` / `documentation` / `archive`)
  - Updated status (`pending` / `in_progress` / `done` / `fail` / `skip`)
- [ ] **If new requirement:** Entry created in `bachelorprojekt.requirements` with category, name, and description

**Tracking update method used:** <!-- UI / psql / MCP -->

## Requirements Traceability

> The **tracking database** is the single source of truth for all requirements and deployment status.
> Access via: Tracking UI (http://tracking.localhost), `task tracking:psql`, or PostgreSQL MCP.

- [ ] **Checked** whether a matching requirement exists in the tracking DB (`bachelorprojekt.requirements`)
- [ ] **If no entry exists:** Created via Tracking UI or SQL with: id, category, name, description, acceptance_criteria, test_cases, priority

**Requirement ID:** <!-- e.g. FA-09, SA-08, NFA-08 -->

## Test Plan

> Tests in this PR must match the `test_cases` column of the requirement in the tracking DB.

**Requirement JSON Testfall:**
<!-- Paste the Testfall field from the JSON entry so reviewers can verify coverage -->

**Tests implemented:**
- [ ] Test script added/updated in `tests/local/` (bash) or `tests/e2e/specs/` (Playwright)
- [ ] Each test case (T1, T2, ...) from the JSON `Testfall` is covered by an assertion
- [ ] Assertions use the correct requirement ID and test ID: `assert_* ... "REQ-ID" "T1" "description"`
- [ ] `./tests/runner.sh local <REQ-ID>` passes

## Screenshots / Logs

<!-- If applicable, paste output or screenshots -->
