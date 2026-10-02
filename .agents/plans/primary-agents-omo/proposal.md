# Proposal: Primary Agents over OMO Engine (T900858)

## WARUM

Slim's `orchestrator` is the sole interactive orchestration definition; the OMO
engine (`explorer`, `librarian`, `fixer`, `oracle`, `designer`) covers generic
capability. The six `bachelorprojekt-*` domain agents duplicate topology,
commands, and escalation text across files, and the three legacy opencode
primaries (`glimmer-primary`, `big-pickle`, `ox-alpha-free`) overlap each other
and the orchestrator. Result: routing ambiguity, prompt drift, stale MCP
mappings.

Lavish board (A.3): skipped — brainstorming completed via Q&A, no visual
question arose. Fan-out (3.7b): skipped — config-only change, four small
partials, full context already held; partials written directly, lint-verified.

## WAS (approved 2026-10-02)

Three thin domain primaries over the OMO engine, mirrored in both harnesses:

- `bp-build` — infra + security (manifests, Taskfile, secrets)
- `bp-run` — ops + db live reads (fleet/devmesh, postgres)
- `bp-ship` — test + website (BATS/Playwright, Astro, pnpm)

Domain knowledge by reference (AGENTS.md, reference.md, runtimes.md,
recall-routing), never duplicated. Rollout in stages: opencode primaries →
Claude Code mirrors + routing → legacy retirement incl. spec-guard updates
(`single-static-model.bats`, `glimmer-worker-mcp.bats` pin `glimmer-primary`).

Full design: `design.md` in this folder.
