---
title: Primary agents over OMO engine (bp-build/bp-run/bp-ship)
ticket_id: T900858
domains: [agents, docs]
status: draft
---

# primary-agents-omo — Implementation Plan

Implements the approved design (`design.md`): three thin domain primaries over
the OMO engine, mirrored in opencode + Claude Code, then legacy retirement.

## File Structure

- `.opencode/agent-models.jsonc` — add `bp-build`, `bp-run`, `bp-ship`
  primaries; drop `glimmer-primary`, `big-pickle`, `ox-alpha`, `ox-alpha-free`
- `.opencode/opencode.jsonc` — `permission.task` allowlists for the new primaries
- `.opencode/prompts/bp-build.md`, `bp-run.md`, `bp-ship.md` — new thin prompts
- `.claude/agents/bp-build.md`, `bp-run.md`, `bp-ship.md` — new mirrors
- `.claude/agents/bachelorprojekt-ops.md`, `-db.md`, `-infra.md`, `-test.md`,
  `-website.md`, `-security.md` — deleted on retirement
- `AGENTS.md` — routing table 6 rows to 3 rows
- `tests/spec/primary-agents-omo.bats` — new roster guard (red to green)
- `tests/spec/llm-local-dev/single-static-model.bats`,
  `tests/spec/llm-local-dev/glimmer-worker-mcp.bats` — guard updates

S1 note: all touched extensions (`.jsonc`, `.md`, `.bats`) are outside the
`gates.yaml` `s1.limits` set, so no per-file line budgets apply; new files stay
small with headroom by construction. S4: every new prompt/agent file is
referenced (agent-models `prompt` refs, AGENTS.md routing rows). No
brand-domain literals appear in any snippet.

## Partials

| id | file | kind | target_files | depends_on | min_tier | ctx_tokens |
|----|------|------|--------------|------------|----------|------------|
| p1 | tasks.d/p1-opencode-primaries.md | impl | `.opencode/agent-models.jsonc`, `.opencode/opencode.jsonc`, `.opencode/prompts/bp-build.md`, `.opencode/prompts/bp-run.md`, `.opencode/prompts/bp-ship.md` |  | 27b-local | 80000 |
| p2 | tasks.d/p2-claude-mirrors.md | impl | `.claude/agents/bp-build.md`, `.claude/agents/bp-run.md`, `.claude/agents/bp-ship.md`, `AGENTS.md` |  | 27b-local | 32000 |
| p3 | tasks.d/p3-retire-guards.md | impl | `.claude/agents/bachelorprojekt-ops.md`, `.claude/agents/bachelorprojekt-db.md`, `.claude/agents/bachelorprojekt-infra.md`, `.claude/agents/bachelorprojekt-test.md`, `.claude/agents/bachelorprojekt-website.md`, `.claude/agents/bachelorprojekt-security.md`, `tests/spec/llm-local-dev/single-static-model.bats`, `tests/spec/llm-local-dev/glimmer-worker-mcp.bats`, `tests/spec/primary-agents-omo.bats` | p1, p2 | 27b-local | 32000 |
| p4 | tasks.d/p4-verify.md | tests | — (verify only, no file changes) | p3 | 4b-local | 32000 |

<!-- vitest: kein neuer Test nötig, weil keine Website-TS/Svelte-Logik geändert wird -->

## Verify

Final gate (executed in p4, tests role):

- `task test:changed`
- `task freshness:regenerate`
- `task freshness:check`
