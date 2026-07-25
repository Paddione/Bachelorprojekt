# Partial 3: Agent-Tracing & Config-Standard

Instruments local subagent runs via codebase-memory-mcp ingest_traces and establishes agent configuration documentation reference.

## Target Files
`scripts/agent-tracing.mjs`
`.claude/skills/references/agent-config-standard.md`

## Tasks

- [ ] Task 3.1: Implement `scripts/agent-tracing.mjs` wrapper to capture subagent execution metrics (model, effort, prompt, tool calls, duration) and ingest via codebase-memory-mcp.
- [ ] Task 3.2: Create reference document `.claude/skills/references/agent-config-standard.md` defining exact semantics for agent configuration fields.
