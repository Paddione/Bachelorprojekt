---
title: MCP Registry Drift Fix — CLAUDE.md + SKILL.md
ticket_id: T900080
domains: [agent-skills]
status: planning
---

# Tasks: MCP Registry Drift Fix

**Ticket:** [T900080]
**Change:** mcp-registry-drift-T900080

## File Structure

| Datei | Art | Zeilen jetzt | Zeilen danach | Wirksame S1-Schwelle | Budget |
|---|---|---|---|---|---|
| `CLAUDE.md` | geändert | ~20 | ~20 | 2000 (Limit) | — |
| `.opencode/skills/mishap-tracker/SKILL.md` | geaendert | ~647 | ~647 | 2000 (Limit) | — |

## Partials

| # | Partial | target_files |
|---|---------|-------------|
| 1 | Sync CLAUDE.md MCP runtime list | CLAUDE.md |
| 2 | Resolve dead mcp__* refs in SKILL.md | .opencode/skills/mishap-tracker/SKILL.md |
| 3 | Verify (lint, freshness, test) | (all changed files) |

## Tasks

### 1. Sync CLAUDE.md MCP runtime list

**File:** `CLAUDE.md` (line 20)

**Current (drifted):**
```
The opencode runtime registers: bge-mcp, brain-mcp, codebase-memory-mcp, docfork, factory-mcp, github-mcp, mcp-kubernetes, mcp-postgres, mcp-task-runner, playwright, sequential-thinking, ticket-mcp, webresearch.
```

**Target (synced to mcp.yaml clients ∩ opencode.jsonc keys):**
```
The opencode runtime registers: bge-mcp, brain-mcp-node, codebase-memory-mcp, factory-mcp-node, mcp-kubernetes, mcp-postgres, mcp-task-runner, playwright, ticket-mcp-node.
```

**Rationale:**
- `brain-mcp` → `brain-mcp-node` (mcp.yaml client key, opencode.jsonc key)
- `factory-mcp` → `factory-mcp-node` (mcp.yaml client key, opencode.jsonc key)
- `ticket-mcp` → `ticket-mcp-node` (mcp.yaml client key, opencode.jsonc key)
- Remove `docfork`, `github-mcp`, `sequential-thinking`, `webresearch` — removed from mcp.yaml 2026-08-30 as stale disabled overrides (mcp.yaml line 309: "Entfernt 2026-08-30 (stale): github-mcp (gh-axi mandatiert), docfork, sequential-thinking, webresearch — reine Disabled-Overrides ohne Nutzer.")
- `codebase-memory-mcp` already present — no change needed for this one

**Note:** The CLAUDE.md agent routing table (lines 14-17) references `ticket-mcp`, `mcp-postgres`, `mcp-kubernetes` by their short names — these are human-readable MCP server identifiers (not tool names like `mcp__...__`). `mcp-kubernetes` and `mcp-postgres` match opencode.jsonc keys exactly. `ticket-mcp` in the routing table context is a shorthand reference to the ticket management MCP capability; since the actual opencode key is `ticket-mcp-node`, this should be updated to `ticket-mcp-node` for consistency. However, the routing table is Claude Code-focused (not opencode runtime), and `ticket-mcp` there refers to the Go-Adapter concept. Per the ticket scope, the fix is CLAUDE.md line 20 runtime list only — the routing table references are agent-specific documentation for Claude Code's perspective and are outside scope unless they create G-AGENTIC11 violations.

## 2. Resolve dead mcp__* refs in SKILL.md

**File:** `.opencode/skills/mishap-tracker/SKILL.md` (line 647)

**Current:**
```
mcp__factory-mcp__factory_status({})
```

**Target:**
```
mcp__factory-mcp-node__factory_status({})
```

**Rationale:** `mcp__factory-mcp__` references a server that does not exist in mcp.yaml clients or opencode.jsonc keys. The correct server name is `factory-mcp-node`.

## 3. Verify

**Run:**
```bash
# Lint check on plan (if plan-lint.sh supports this scope)
bash scripts/plan-lint.sh openspec/changes/mcp-registry-drift-T900080/tasks.md

# Freshness check
task freshness:check

# Code quality
task test:code-quality
```

## expected: FAIL

Running verification tests — will pass after implementation.
