---
title: Over Threshold Plan
ticket_id: T000910
domains: [infra]
status: active
---

# Over Threshold Implementation Plan

**Goal:** Demonstrate a B1b warning (still exit 0).

Die Zieldatei ist ein synthetischer Gate-Fixture unter
`scripts/code-quality/fixtures/plan-lint/` — 850 Zeilen gegen das statische
`.sh`-Limit 800, Restbudget -50. Er liegt im Scan-Ignore (`scan.ignore_globs`
in `docs/code-quality/gates.yaml`), damit check.mjs ihn nicht selbst als
S1-Verstoß meldet; plan-lint misst ihn trotzdem, weil plan-lint nur
`s1.ignore` kennt. Der B1b-Anker haengt am `.sh`-Limit: wird es ueber 850
angehoben, ist die Fixture um entsprechend mehr Zeilen zu verlaengern
(Marge mitverfolgen, nicht blind kopieren).

## File Structure

| File | Ist | Budget |
|------|-----|--------|
| `scripts/code-quality/fixtures/plan-lint/over-threshold-target.sh` | 850 | -50 |

## Task 1: Edit
- Edit `scripts/code-quality/fixtures/plan-lint/over-threshold-target.sh`

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
