---
title: "auto-close-plan-only-all-branches — Implementation Plan"
ticket_id: T003765
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# auto-close-plan-only-all-branches — Implementation Plan

_Ticket: T003765_

## File Structure

- `scripts/factory/auto-close-merged.sh` — plan-only-Prüfung (`pr_is_plan_only`) auf ALLE Nicht-Archive-Branch-Familien ausdehnen (vorher nur `chore/openspec-*`)
- `tests/spec/software-factory/ticket-lifecycle.bats` — Regression-Test, der sicherstellt, dass der plan-only-Aufruf nicht mehr an `chore/openspec-*` gebunden ist
- `openspec/changes/auto-close-plan-only-all-branches/specs/software-factory.md` — Delta: auto-close-Skip für plan-only PRs unabhängig von der Branch-Familie

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Regression-Test in `ticket-lifecycle.bats` (T003765) reproduziert den Gap: der plan-only-Aufruf darf nicht hinter einem `^chore/openspec-`-Gate stehen. FAIL auf altem Stand, weil der Aufruf gate-ed war.
      expected: FAIL
- [x] **Fix-Step (GREEN).** `pr_is_plan_only` wird für jede Nicht-Archive-Branch-Familie aufgerufen; der `chore/openspec-`-Gate-Zweig ist entfernt.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
