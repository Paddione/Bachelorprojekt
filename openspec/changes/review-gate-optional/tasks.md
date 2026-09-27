---
title: review-gate-optional implementation plan
ticket_id: T900687
domains: [test, docs]
status: active
---

# review-gate-optional — Implementation Plan

## File Structure

### Changed files

- `.opencode/skills/dev-flow-execute/SKILL.md` (Schritt 3.8 Merge-Gate, Querverweise; .md not S1-gated)
- `.opencode/skills/dev-flow-execute/references/implementer-handoff.md` (Merge-Gate wording; .md not S1-gated)
- `.opencode/skills/references/dev-flow-lifecycle.md` (review only on request; .md not S1-gated)
- `.opencode/skills/OVERVIEW.md` (Verifikations-Leiter; .md not S1-gated)
- `tests/spec/agent-skills/review-gate-before-auto-merge.bats` (guards; .bats not S1-gated)
- `tests/spec/agent-skills/automerge-preflight-check.bats` (integration anchor; .bats not S1-gated)
- `tests/spec/agent-skills/dev-flow-lifecycle-contract.bats` (order and re-entry; .bats not S1-gated)
- `components/website/src/data/test-inventory.json` (regenerated; .json not S1-gated)

S1 note: no target carries an S1 limit (.md/.bats/.json). No `.sh` file is touched; `scripts/check-pr-automerge.sh` stays unchanged by design (D5). No baseline entries may be added.

## Partials

| id | plan | role | target_files | depends_on | min_tier | ctx_tokens |
|----|------|------|--------------|------------|----------|------------|
| p1 | tasks.d/p1-skill-docs.md | impl | .opencode/skills/dev-flow-execute/SKILL.md, .opencode/skills/dev-flow-execute/references/implementer-handoff.md, .opencode/skills/references/dev-flow-lifecycle.md, .opencode/skills/OVERVIEW.md |  | 27b-local | 32000 |
| p2 | tasks.d/p2-tests.md | tests | tests/spec/agent-skills/review-gate-before-auto-merge.bats, tests/spec/agent-skills/automerge-preflight-check.bats, tests/spec/agent-skills/dev-flow-lifecycle-contract.bats, components/website/src/data/test-inventory.json | p1 | 27b-local | 32000 |

Execution order: p1, then p2, then Task 3. Each partial commits its own files with explicit pathspecs, never broad adds. Commits carry `[T900687]`.

## Task 3: Final verification across all partials

Steps:

1. Run the full relevant gate set from the worktree root:
   - `task test:changed`
   - `task freshness:regenerate`
   - `task freshness:check`
2. Run `task openspec:validate` and re-run the plan linter: `bash scripts/plan-lint.sh openspec/changes/review-gate-optional/tasks.md` — exit 0.
3. Confirm the acceptance criteria of both partials hold and that no partial touched files outside its manifest row (`git diff --name-only origin/main...HEAD`).

Acceptance: all gate commands green, plan-lint exit 0, the spec delta `specs/agent-skills.md` matches the shipped skill text.
