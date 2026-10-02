---
title: mcp-check-hermetic implementation plan
ticket_id: T900922
domains: [test, bats]
status: staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mcp-check-hermetic — Implementation Plan

_partial-index —_

Zweck: Die drei `mcp-sync.sh check`-Tests werden unabhaengig vom
Token-Env des Aufrufers, indem sie `BGE_MCP_TOKEN` und
`MCP_POSTGRES_TOKEN` vor dem Check-Aufruf unsetten. Ursache per
Laengen-/Match-Vergleich und Gegenprobe verifiziert (Details in
`design.md` E1).

## File Structure

### New files

None.

### Changed files

- `tests/spec/mcp-tooling.bats` (T002398: env -u-Praefix an beiden check-Runs, Anker + Drift; .bats not S1-gated, no numeric budget claimed)
- `tests/spec/mcp-gateway.bats` (check-passes-Test: env -u-Praefix am Live-Run; .bats not S1-gated, no numeric budget claimed)
- `tests/spec/mcp-gateway/authenticated-http-headers.bats` (stays-green-Test: env -u-Praefix am Live-Run; .bats not S1-gated, no numeric budget claimed)

S1 note: no target carries a static limit. BATS files have no S1 limit entries in `docs/code-quality/gates.yaml` and all three report `nicht-baselined` via the baseline jq lookup. No baseline entries are added and no numeric budget is claimed for any file.

<!-- vitest: kein neuer Test nötig, weil nur BATS-Dateien angefasst werden, kein website/src-Code. -->

Prior art (T002829): `grep -rn -e 'mcp-tooling' -e 'mcp:check' docs/adr/` has no hits. Guards hitting the same script: `mcp-gateway.bats`, `authenticated-http-headers.bats`, the no-secret-leak tests (already hermetic via fake-HOME), the T002779 guard (knock-on victim, turns green with this fix). No discarded solution direction on record; T002704 renderer precedence stays untouched.

## Partials

| id | plan | role | target_files | depends_on | min_tier | ctx_tokens |
|----|------|------|------|--------------|------------|----------|------------|
| p1 | tasks.d/p1-impl.md | impl | tests/spec/mcp-tooling.bats, tests/spec/mcp-gateway.bats, tests/spec/mcp-gateway/authenticated-http-headers.bats |  | 4b-local | 32000 |
| p2 | tasks.d/p2-tests.md | tests | tests/spec/ci-cd/spec-tracked-file-guard.bats | p1 | 4b-local | 32000 |

Execution order honoring depends_on: p1 first, then p2, then Task 3. Each partial commits its own files as `fix(T900922): <subject> [T900922]` with explicit pathspecs, never broad adds. p1 touches exactly the four check invocations (one `env -u`-prefix each) and keeps every assertion byte-identical; p2 is verify-only on the guard file (no edit — it must turn green through p1 alone, otherwise the executor stops and reports instead of adjusting the guard silently).

## Task 3: Final verification across all partials

Steps:

1. Run the full relevant gate set from the worktree root:
   - `task test:changed`
   - `task freshness:regenerate`
   - `task freshness:check`
2. Re-run the plan linter on this index to confirm the shipped plan still passes: `bash scripts/plan-lint.sh .agents/plans/mcp-check-hermetic/tasks.md` — exit 0, no new warnings versus the staged state.
3. Confirm each partial's acceptance criteria from its tasks.d file hold end to end (three tests green in token-poisoned shell, drift detection intact, guard green) and that no partial touched files outside its manifest row.

Acceptance: all three gate commands green, plan-lint exit 0, every manifest target exists on the branch.
