---
title: "t001537 — Implementation Plan"
ticket_id: T001537
domains: [secret-rotation]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t001537 — Implementation Plan

Ticket: T001537 — Rotate secrets after accidental transcript exposure

## File Structure

```
tests/spec/secret-rotation-exposure.bats  # Failing test + fix implementation
scripts/secret-rotate.sh                  # CLI command for secret rotation
openspec/changes/t001537/proposal.md      # Updated with Why & What
openspec/changes/t001537/specs/t001537.md # Requirements with scenarios
```

## Verify (RED → GREEN)

### Task 1: Failing Test — No Secret Rotation Without --force

- **expected: FAIL** The test verifies that secret rotation requires explicit trigger (--force flag).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/secret-rotation-exposure.bats
# expected: FAIL (secrets are not rotated automatically)
```

### Task 2: Fix — Implement Secret Rotation CLI

Implement `scripts/secret-rotate.sh` that:
1. Regenerates secrets using `env-generate.sh --force`
2. Re-seals them using `env-seal.sh`
3. Rotates all environments (dev, mentolder, korczewski) or a specific one via `--env <name>`

After implementing, run:
```bash
tests/unit/lib/bats-core/bin/bats tests/spec/secret-rotation-exposure.bats
# expected: PASS (secrets are rotated successfully with --force)
```

### Task 3: Final Verification

Run the mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
