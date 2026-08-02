---
title: "fix-ci-shard1-parallel-buffer-T002517 — Implementation Plan"
ticket_id: T002517
domains: [ci]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-ci-shard1-parallel-buffer-T002517 — Implementation Plan

_Ticket: T002517_

## File Structure

```
.github/workflows/ci.yml                                # (fix) TMPDIR=$RUNNER_TEMP für bats -j
tests/spec/ci-cd.bats                                   # (add) test: TMPDIR gesetzt in CI workflow
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der CI-Workflow setzt aktuell kein TMPDIR für
      den `bats -j`-Aufruf. Der Test prüft, dass der Spec-BATS-Schritt TMPDIR
      auf `${{ runner.temp }}` setzt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats --filter "T002517"
# expected: FAIL (red — TMPDIR not set in workflow)
```

- [ ] **Step 1: TMPDIR in CI-Workflow setzen.** Im `test-factory-shard` Job den
      `Spec BATS suite`-Step um `TMPDIR: ${{ runner.temp }}` in `env:` ergänzen.

- [ ] **Fix-Step (GREEN).** Der BATS-Test muss jetzt passen.

- [ ] **Final Verification.**

```bash
task test:changed
task freshness:check
```
