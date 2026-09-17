---
title: "llm-proxy-readiness-prio0 — Implementation Plan"
ticket_id: T900212
domains: [llm, test]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# llm-proxy-readiness-prio0 — Implementation Plan

_Ticket: T900212_

## File Structure

```
scripts/llm-proxy/discovery.mjs                              # changed: primary tier = priority <= 1 (285 lines, S1 budget unchanged, +0 net lines)
tests/spec/local-llm-proxy/readiness-primary-tier.bats       # new (committed with this plan, RED)
openspec/changes/llm-proxy-readiness-prio0/specs/local-llm-proxy.md  # MODIFIED delta (committed with this plan)
```

## Task 1: Failing test (RED) — already committed

- [x] Confirm the reproducer is red on the branch before touching code. (verified 2026-09-17: test 1 red, tests 2+3 green)

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/readiness-primary-tier.bats
# expected: FAIL (test 1 "gesundes priority-0-Backend macht den Proxy ready" is red; tests 2 and 3 are green guards)
```

## Task 2: Fix `evaluateReadiness` (GREEN)

File: `scripts/llm-proxy/discovery.mjs`

- [x] In `evaluateReadiness`, change the primary filter:

```js
  const primary = backends.filter((b) => b.priority <= 1);
```

- [x] Update the JSDoc above `evaluateReadiness`: replace "Massgeblich sind die Backends mit `priority === 1`" with "Massgeblich sind die Backends der Primaerstufe (`priority <= 1`; seit T900189 traegt freetoken-local priority 0)". Keep line count unchanged.
- [x] Update the inline comment "Ein Prio-1-Backend, das drained" to "Ein Primaer-Backend (priority <= 1), das drained".
- [x] Run the reproducer and the existing node suite: (verified 2026-09-17: 3/3 BATS, 28/28 node green)

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/readiness-primary-tier.bats
node --test scripts/llm-proxy/server.test.mjs scripts/llm-proxy/gpu-lock.test.mjs
# expected: PASS (all 3 BATS tests, all node tests)
```

## Task 3: Live check after merge (manual, not a CI gate)

- [ ] After merge, restart the local proxy and check readiness:

```bash
systemctl --user restart llm-proxy.service
curl -s 127.0.0.1:18235/health
# expected: {"status":"ok","ready":true,...}
```

## Task 4: Final Verification

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
