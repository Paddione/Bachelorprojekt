---
title: e2e-vision-agent-harness
ticket_id: T901645
domains: [e2e, llm]
status: propose
---
# e2e-vision-agent-harness — Implementation Plan

Vision-Agent-Harness für kuratierte Playwright-Flows: Runner-Loop
(Screenshot → JSON-Aktion), Orakel-Modul, `curated.json`-SSOT mit 6–8
Flows, Bench-Runbook. Details: `proposal.md`, `design.md`, Partials in
`tasks.d/`.

## File Structure

| path | status | purpose |
|------|--------|---------|
| `tests/e2e/agent/runner.mjs` | neu | Agent-Loop + CLI + JSONL-Report |
| `tests/e2e/agent/oracle.mjs` | neu | deterministische Flow-Checks |
| `tests/e2e/agent/curated.json` | neu | SSOT der kuratierten Flows |
| `docs/runbooks/e2e-vision-agents.md` | neu | Serve + Bench-Protokoll |
| `tests/e2e/agent/oracle.test.mjs` | neu | Orakel-Tests (`node --test`) |

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-agent-core.md | impl | `tests/e2e/agent/runner.mjs`, `tests/e2e/agent/oracle.mjs` |  |
| p2 | tasks.d/p2-curated-data.md | impl | `tests/e2e/agent/curated.json`, `docs/runbooks/e2e-vision-agents.md` | p1 |
| p3 | tasks.d/p3-tests.md | tests | `tests/e2e/agent/oracle.test.mjs` | p1, p2 |
