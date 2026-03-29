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

### If modifying Docker Compose (`docker-compose.yml`)
- [ ] `.env.example` updated if new variables are needed
- [ ] `docker compose config` validates successfully
- [ ] Tested with `docker compose up` locally

### If modifying scripts (`scripts/`)
- [ ] `shellcheck` passes (warnings acceptable, errors are not)
- [ ] Tested on a clean environment

### If modifying authentication (Keycloak / OIDC)
- [ ] `realm-homeoffice.json` and `k3d/realm-homeoffice-dev.json` are in sync
- [ ] SSO login tested for all affected services

## Requirements Traceability

> Every functional change must be traceable to a requirement in `docs/requirements/`.

- [ ] **Checked** whether a matching requirement entry exists in the appropriate JSON file:
  - `FA_requirements.json` — Functional requirements
  - `SA_requirements.json` — Security requirements
  - `NFA_requirements.json` — Non-functional requirements
  - `AK_requirements.json` — Acceptance criteria
  - `L_requirements.json` — Deliverables
- [ ] **If no entry exists:** Created a new entry with the following fields:
  - `Bezeichnung` — Short title
  - `Beschreibung` — Detailed description
  - `Erfüllungskriterien` — Numbered acceptance criteria
  - `Testfall` — Test cases (T1, T2, ...) that verify the criteria
- [ ] **Added entry to the correct grouped JSON** file (FA/SA/NFA/AK use object format `{"REQ-ID": {...}}`, L uses array format `[{"ID": "L-XX", ...}]`)

**Requirement ID:** <!-- e.g. FA-09, SA-08, NFA-08 -->

## Test Plan

> Tests in this PR must match the `Testfall` entries defined in the requirement JSON.

**Requirement JSON Testfall:**
<!-- Paste the Testfall field from the JSON entry so reviewers can verify coverage -->

**Tests implemented:**
- [ ] Test script added/updated in `tests/local/` or `tests/prod/` (bash) or `tests/e2e/specs/` (Playwright)
- [ ] Each test case (T1, T2, ...) from the JSON `Testfall` is covered by an assertion
- [ ] Assertions use the correct requirement ID and test ID: `assert_* ... "REQ-ID" "T1" "description"`
- [ ] `./tests/runner.sh local <REQ-ID>` passes

## Screenshots / Logs

<!-- If applicable, paste output or screenshots -->
