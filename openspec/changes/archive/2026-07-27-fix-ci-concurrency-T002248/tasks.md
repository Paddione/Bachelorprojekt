---
title: "fix-ci-concurrency-T002248 — Implementation Plan"
ticket_id: T002248
domains: [ci, tests, docs]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-ci-concurrency-T002248 — Implementation Plan

_Ticket: T002248_

## File Structure

```
.github/workflows/ci.yml                          # Mishap 1: edited aus concurrency-cancel ausnehmen
tests/e2e/specs/global-db-cleanup.ts               # Mishap 2: Skip-Guard für fehlendes CRON_SECRET
.claude/skills/git-workflow/SKILL.md                # Mishap 3: Auto-Merge-Race-Hinweis
```

## Partial Breakdown

### Partial 1: ci.yml concurrency fix

**Impact:** `.github/workflows/ci.yml` (1 file, ~100 lines)

- `concurrency.cancel-in-progress`: `github.event.action != 'edited'` setzen, damit `edited`-Runs den laufenden echten CI-Run nicht abbrechen
- Oder `concurrency.group` um `github.event.action` erweitern – separater Slot für edited-Events

### Partial 2: E2E Skip-Guard

**Impact:** `tests/e2e/specs/global-db-cleanup.ts` (1 file)

- `CRON_SECRET`-Prüfung durch Skip ersetzen statt throw
- Taskfile `test:changed` E2E-Leg dokumentieren

### Partial 3 (Tests): BATS-Test + Verify

- BATS-Test für `ci.yml` concurrency-Verhalten (STRUCT2: expected FAIL)
- Verify: `task test:changed`, `task freshness:check`

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Add the BATS test that reproduces the ci.yml concurrency issue.

```bash
tests/spec/fix-ci-concurrency.bats
# expected: FAIL (red — the fix is not yet implemented)
```

- [ ] **Fix ci.yml.** `edited` aus concurrency-cancel ausnehmen oder group erweitern.

```bash
tests/spec/fix-ci-concurrency.bats
# expected: PASS
```

- [ ] **Fix E2E Skip.** Throw durch Skip ersetzen.

```bash
cd tests/e2e && npx playwright test --grep "skip without CRON_SECRET"
# expected: PASS
```

- [ ] **Final Verification.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
