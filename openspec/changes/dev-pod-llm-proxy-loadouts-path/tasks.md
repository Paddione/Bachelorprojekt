---
title: "dev-pod-llm-proxy-loadouts-path — Implementation Plan"
ticket_id: T900109
domains: [llm-proxy, infra, dev-pod]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# dev-pod-llm-proxy-loadouts-path — Implementation Plan

_Ticket: T900109_

## File Structure

```
docker/mcp-node/supervisor.sh
scripts/llm-proxy/loadouts.mjs
scripts/llm-proxy/loadouts.test.mjs
tests/spec/local-llm-proxy/dev-pod-loadouts-path.bats
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Add test cases in `scripts/llm-proxy/loadouts.test.mjs` and BATS spec reproducing the loadouts.json ENOENT when invoked from outside repo root. The test must FAIL on the current branch. Use the phrase `expected: FAIL` in the step body so plan-lint STRUCT2 picks it up.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/dev-pod-loadouts-path.bats
# expected: FAIL (red — the fix is not yet implemented)
```

- [ ] **Fix-Step (GREEN).** Implement `resolveDefaultLoadoutsPath()` in `scripts/llm-proxy/loadouts.mjs` supporting `LOADOUTS_PATH`, `DEV_POD_REPO`, and repo-relative module resolution. Update `docker/mcp-node/supervisor.sh` to pass `LOADOUTS_PATH`.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
