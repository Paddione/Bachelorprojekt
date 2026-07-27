---
title: S1 Ignored File Plan
ticket_id: T002270
domains: [infra]
status: active
---

# S1 Ignored File Implementation Plan

**Goal:** A plan touching a file listed under `s1.ignore` in
`docs/code-quality/gates.yaml`. The S1 gate does not measure this file, so B1b
must stay silent for it — even though its raw line count is far above the static
`.sh` limit. This fixture deliberately contains none of the B1b escape keywords,
so a passing result proves the ignore list was honoured rather than a keyword
having been matched.

## File Structure

| File | Ist | Budget |
|------|-----|--------|
| `scripts/ticket.sh` | 866 | n/a |

## Task 1: Edit

- [ ] **Step 1: Write the failing test**

```bash
@test "x" { run true; }
```

- [ ] **Step 2: Run to verify it fails**

Run: `bats x`
Expected: FAIL

## Task 2: Verify

- [ ] **Step 1**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
