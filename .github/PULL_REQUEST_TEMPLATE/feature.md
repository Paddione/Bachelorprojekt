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

> Every feature must be backed by a requirement entry in the tracking database.
> Use `task tracking:psql` to query/add requirements, or view them at `tracking.localhost`.

1. **Check** if a requirement entry exists for this feature:
   ```sql
   SELECT id, name, category FROM bachelorprojekt.requirements WHERE id = 'FA-XX';
   ```

2. **If no entry exists**, add one:
   ```sql
   INSERT INTO bachelorprojekt.requirements (id, category, name, description, acceptance_criteria, test_cases)
   VALUES ('FA-XX', 'Funktionale Anforderung', 'Short title', 'Description', '1) First criterion\n2) Second', 'T1: First test\nT2: Second test');
   ```

3. **Write tests** that match the `test_cases` column:
   - Bash: `tests/local/<REQ-ID>.sh` or `tests/prod/<REQ-ID>.sh`
   - Playwright: `tests/e2e/specs/<req-id>-<name>.spec.ts`
   - Each assertion must reference the correct `REQ-ID` and `Tn`

- [ ] Requirement entry exists in tracking DB (or was created in this PR)
- [ ] `acceptance_criteria` are specific and verifiable
- [ ] `test_cases` entries (T1, T2, ...) cover all acceptance criteria
- [ ] Test script implements all test cases
- [ ] `./tests/runner.sh local <REQ-ID>` passes

**Requirement ID:** <!-- e.g. FA-09 -->

### Manual Testing

- [ ] Deployed to k3d cluster (`task homeoffice:deploy`)
- [ ] Verified service is accessible via `*.localhost`
- [ ] Verified SSO flow works end-to-end (if auth-related)
- [ ] Ran relevant test suite (`tests/runner.sh`)

### Rollback Plan

<!-- How to revert if this breaks something? Usually: revert the PR. -->
