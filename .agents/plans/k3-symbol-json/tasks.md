---
title: k3-symbol-json implementation plan
ticket_id: T900907
domains: [dev-tooling, bats]
status: staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# k3-symbol-json — Implementation Plan

_partial-index —_

Zweck: `k3_symbol` in `config/repo-knowledge.lua` spricht wieder mit
Binary 0.10.8 (`search_graph` braucht `"format":"json"` im Payload und
liefert `cols`/`rows` statt `results[]`), sodass T75 und der neue
Treffer-Test gruen werden. Ursache per Roh-Call verifiziert (Details in
`design.md` E1).

## File Structure

### New files

None.

### Changed files

- `dotfiles/nvim/lua/config/repo-knowledge.lua` (k3_symbol-Payload um format=json erweitern, rows-Mapping, First-Brace-Haertung in k3_call, Kopf-Kommentar auf 0.10.8 heben; Ist 471, .lua not S1-gated, no numeric budget claimed)
- `tests/spec/neovim-dashboard.bats` (Treffer-Test bereits als RED-Test in dieser Branch enthalten; p2 verifiziert nur, kein weiterer Edit erwartet; Ist 2578 vor dem RED-Test, .bats not S1-gated, no numeric budget claimed)
- `components/website/src/data/test-inventory.json` (only if freshness regeneration changes it; .json not S1-gated, no numeric budget claimed)

S1 note: no target carries a static limit. Lua, BATS-shell-test and JSON files have no S1 limit entries in `docs/code-quality/gates.yaml` and all three report `nicht-baselined` via the baseline jq lookup. No baseline entries are added and no numeric budget is claimed for any file.

<!-- vitest: kein neuer Test nötig, weil der Fix Lua- und BATS-Dateien betrifft, kein website/src-Code angefasst wird. -->

Prior art (T002829): `grep -rn -e 'repo-knowledge' -e 'codebase-memory-mcp' docs/adr/` has no hits; `grep -rln 'repo-knowledge' tests/spec/` hits only `tests/spec/neovim-dashboard.bats`, the suite this plan extends. The stale 0.9.0 CLI contract in the lua header comment is updated by p1.

## Partials

| id | plan | role | target_files | depends_on | min_tier | ctx_tokens |
|----|------|------|------|--------------|------------|----------|------------|
| p1 | tasks.d/p1-impl.md | impl | dotfiles/nvim/lua/config/repo-knowledge.lua |  | 4b-local | 32000 |
| p2 | tasks.d/p2-tests.md | tests | tests/spec/neovim-dashboard.bats, components/website/src/data/test-inventory.json | p1 | 27b-local | 64000 |

Execution order honoring depends_on: p1 first, then p2, then Task 3. Each partial commits its own files as `fix(T900907): <subject> [T900907]` with explicit pathspecs, never broad adds (`git add -f` for dotfiles paths — dotfiles/ is gitignored, force-add per repo convention). p1 keeps every other action (`k3_status`, `k3_trace`, quickfix plumbing) byte-identical and touches only the `search_graph` call path plus the header contract; p2 is verify-only on the guard file (no edit unless the measurement basis changed, in which case the executor stops and reports instead of adjusting the guard silently).

## Task 3: Final verification across all partials

Steps:

1. Run the full relevant gate set from the worktree root:
   - `task test:changed`
   - `task freshness:regenerate`
   - `task freshness:check`
2. Re-run the plan linter on this index to confirm the shipped plan still passes: `bash scripts/plan-lint.sh .agents/plans/k3-symbol-json/tasks.md` — exit 0, no new warnings versus the staged state.
3. Confirm each partial's acceptance criteria from its tasks.d file hold end to end (both k3-symbol tests green, k3-status still green, red-green proof recorded) and that no partial touched files outside its manifest row.

Acceptance: all three gate commands green, plan-lint exit 0, every manifest target exists on the branch.
