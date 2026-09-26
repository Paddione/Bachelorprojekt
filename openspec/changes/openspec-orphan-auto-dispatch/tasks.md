---
title: "openspec-orphan-auto-dispatch — Implementation Plan"
ticket_id: T900503
domains: [ci, openspec]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# openspec-orphan-auto-dispatch — Implementation Plan

_Ticket: T900503_ · Design: `openspec/changes/openspec-orphan-auto-dispatch/design.md` ·
Delta: `specs/openspec-workflow.md` (Scheduled-Dispatch-Requirement neu).

## File Structure

- `scripts/openspec-orphan-detect.sh` (p1, neu: Orphan-Erkennung per GitHub-API)
- `.github/workflows/openspec-orphan-archive.yml` (p1, Schedule-Trigger + Detect-Job)
- `tests/spec/openspec-workflow/orphan-detect.bats` (p-tests, neu: Detection mit gestubbtem gh)

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-detect-dispatch.md | impl | scripts/openspec-orphan-detect.sh, .github/workflows/openspec-orphan-archive.yml | |
| p-tests | tasks.d/p-tests-detect.md | tests | tests/spec/openspec-workflow/orphan-detect.bats | p1 |

## Verify (final, wächst mit den Partials)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
