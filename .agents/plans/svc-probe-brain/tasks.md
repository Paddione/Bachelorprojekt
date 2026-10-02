---
title: svc-probe-brain implementation plan
ticket_id: T900916
domains: [infra, monitoring]
status: staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# svc-probe-brain — Implementation Plan

_partial-index —_

Zweck: Der G-SVC01-Guard `svc-probe` wird wieder gruen, indem der neue
Produktions-Ingress `brain.${prod_domain}` (eingefuehrt mit T900859–T900861)
ein Blackbox-Probe-Target erhaelt. Ursache verifiziert am 2026-10-02 auf
`main@4f505c1ee`: Messung `1`, BATS `not ok`, uncovered Label `brain`
(details in `design.md` E1/E4).

## File Structure

### New files

None.

### Changed files

- `k3d/monitoring/blackbox-exporter.yaml` (Probe `brand-public-health`: ein Target `- https://brain.mentolder.de` bei den mentolder-Hosts ergaenzen; Ist 99, .yaml not S1-gated, no numeric budget claimed)
- `tests/spec/health-goals/service-health-goals.bats` (G-SVC01-Guard; read-only Rot-Gruen-Nachweis, keine Aenderung erwartet; Ist-Zeilen ungeprueft, .bats not S1-gated, no numeric budget claimed)

S1 note: neither target carries a static limit. YAML and BATS files have no S1 limit entries in `docs/code-quality/gates.yaml` (`s1.limits` covers astro/ts/svelte/sh/mjs/mts/py/js/jsx/tsx/cjs/bash/java/php only) and `k3d/monitoring/blackbox-exporter.yaml` reports `nicht-baselined` via the baseline jq lookup. No baseline entries are added and no numeric budget is claimed for any file.

S3 note: `k3d/monitoring/blackbox-exporter.yaml` is listed under `s3.allowlist_files` (synthetic monitoring targets public brand identities), so the concrete `brain.mentolder.de` target is gate-clean. korczewski stays untouched (FROZEN per T002479).

Prior art (T002829): `grep -rn -e 'blackbox-exporter' -e 'brain.yaml' docs/adr/` hits only ADR-006 (mentions `k3d/brain.yaml`, a different artifact); `grep -rln 'blackbox-exporter' tests/spec/` hits `tests/spec/fleet-operations/monitoring-ready.bats` plus this plan's guard suite. No discarded solution direction on record; the standing decision (static target list, G-SVC01 validates coverage) stays.

## Partials

| id | plan | role | target_files | depends_on | min_tier | ctx_tokens |
|----|------|------|--------------|------------|----------|------------|
| p1 | tasks.d/p1-impl.md | impl | k3d/monitoring/blackbox-exporter.yaml |  | 4b-local | 32000 |
| p2 | tasks.d/p2-tests.md | tests | tests/spec/health-goals/service-health-goals.bats | p1 | 4b-local | 32000 |

Execution order honoring depends_on: p1 first, then p2, then Task 3. Each partial commits its own files as `fix(T900916): <subject> [T900916]` with explicit pathspecs, never broad adds. p1 touches exactly one line in the Probe's static target list and keeps every other block intact; p2 is verify-only on the guard file (no edit unless the measurement basis changed, in which case the executor stops and reports instead of adjusting the guard silently).

## Task 3: Final verification across all partials

Steps:

1. Run the full relevant gate set from the worktree root:
   - `task test:changed`
   - `task freshness:regenerate`
   - `task freshness:check`
2. Re-run the plan linter on this index to confirm the shipped plan still passes: `bash scripts/plan-lint.sh .agents/plans/svc-probe-brain/tasks.md` — exit 0, no new warnings versus the staged state.
3. Confirm each partial's acceptance criteria from its tasks.d file hold end to end (svc-probe measurement `0`, BATS svc-probe test green, red-green proof recorded) and that no partial touched files outside its manifest row.

Acceptance: all three gate commands green, plan-lint exit 0, every manifest target exists on the branch.
