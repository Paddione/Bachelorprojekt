---
title: "main-commit-guard — Implementation Plan"
ticket_id: T002631
domains: [infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# main-commit-guard — Implementation Plan

_Ticket: T002631_

## File Structure

```
.githooks/pre-commit             # MODIFIED — Neue Section "main-commit-guard"
tests/spec/main-commit-guard.bats # NEW — BATS test
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** BATS-Test, der prüft dass commits auf `main` geblockt werden.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/main-commit-guard.bats
# expected: FAIL (red — der Guard ist noch nicht im pre-commit Hook)
```

- [ ] **Fix-Step (GREEN).** Guard in `.githooks/pre-commit` einbauen. BATS-Test muss jetzt grün sein.

- [ ] **Final Verification.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
