## Feature: <!-- short title -->

### Problem / Motivation

<!-- What gap does this feature fill? Link to issue if applicable. -->

### Solution

<!-- High-level description of the approach. -->

### Changes

- [ ] List key files/components changed

### CI/CD Verification

> **This PR must pass all CI checks before merge.** The following are verified automatically:
> - Kubernetes manifest validation (kustomize build + dry-run)
> - YAML linting
> - Shell script linting
> - Security scan for hardcoded secrets

### Requirements Traceability

> Every feature must be backed by a requirement entry in `docs/requirements/`.

1. **Check** if a JSON entry exists for this feature in the appropriate file:
   - `docs/requirements/FA_requirements.json` — Functional
   - `docs/requirements/SA_requirements.json` — Security
   - `docs/requirements/NFA_requirements.json` — Non-functional
   - `docs/requirements/AK_requirements.json` — Acceptance criteria
   - `docs/requirements/L_requirements.json` — Deliverables (array format)

2. **If no entry exists**, add one using this schema:
   ```json
   "REQ-ID": {
     "Bezeichnung": "Short title",
     "Beschreibung": "Detailed description of what this requirement covers",
     "Erfüllungskriterien": "1) First criterion\n2) Second criterion\n...",
     "Testfall": "T1: First test case\nT2: Second test case\n..."
   }
   ```

3. **Write tests** that match the `Testfall` entries exactly:
   - Bash: `tests/local/<REQ-ID>.sh` or `tests/prod/<REQ-ID>.sh`
   - Playwright: `tests/e2e/specs/<req-id>-<name>.spec.ts`
   - Each assertion must reference the correct `REQ-ID` and `Tn`

- [ ] Requirement JSON entry exists (or was created in this PR)
- [ ] `Erfüllungskriterien` are specific and verifiable
- [ ] `Testfall` entries (T1, T2, ...) cover all `Erfüllungskriterien`
- [ ] Test script implements all `Testfall` entries
- [ ] `./tests/runner.sh local <REQ-ID>` passes

**Requirement ID:** <!-- e.g. FA-09 -->
**JSON file:** <!-- e.g. docs/requirements/FA_requirements.json -->

### Manual Testing

- [ ] Deployed to k3d cluster (`task homeoffice:deploy`)
- [ ] Verified service is accessible via `*.localhost`
- [ ] Verified SSO flow works end-to-end (if auth-related)
- [ ] Ran relevant test suite (`tests/runner.sh`)

### Rollback Plan

<!-- How to revert if this breaks something? Usually: revert the PR. -->
