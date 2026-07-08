---
title: "t001591 — Implementation Plan"
ticket_id: T001591
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t001591 — Implementation Plan

_Ticket: T001591_

## File Structure

```
scripts/harness.ts                    # Spawn-Wrapper mit Lavish-Delegation detection
tests/spec/t001591.bats              # BATS tests für harness
scripts/agent-orchestrator.sh         # Agent orchestration CLI (T001588)
```

## Implementieren (RED → GREEN)

### ① Harness Visual Detection Implementation

Implement `scripts/harness.ts` mit Lavish-Delegation für visual requests.

**Failing Test (RED):**

```bash
# Initial state: harness.ts nicht implementiert, Tests müssen FAIL
tests/unit/lib/bats-core/bin/bats tests/spec/t001591.bats
expected: FAIL - harness.ts ist noch nicht implementiert
```

### ② Harness Visual Detection Fix (GREEN)

Implement `scripts/harness.ts` und alle Testfälle in `tests/spec/t001591.bats`.

**Verify:**

```bash
# Alle Tests müssen durchlaufen und PASSEN
tests/unit/lib/bats-core/bin/bats tests/spec/t001591.bats
expected: PASS - harness visual detection funktioniert
```

### ③ Agent Orchestrator Implementation (T001588)

Implement `scripts/agent-orchestrator.sh` für lokale agent orchestration.

**Verify:**

```bash
# Basic functionality test
./scripts/agent-orchestrator.sh --help | grep -q "Usage:"
expected: PASS - help output funktioniert
```

### ④ Final Verification

Alle Tests und Gates:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/t001591.bats
task test:changed
task freshness:regenerate
task freshness:check
```
