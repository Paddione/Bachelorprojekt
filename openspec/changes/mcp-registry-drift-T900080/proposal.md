---
title: MCP Registry Drift Fix — CLAUDE.md + SKILL.md
ticket_id: T900080
domains: [agent-skills]
status: proposed
---

# Proposal: MCP Registry Drift Fix

**Ticket:** [T900080]
**Date:** 2026-09-04
**Status:** proposed

## Problem

MCP registry drift caused by the skills flip's bigger SKILL.md corpus. Two health goals are red:

- **G-AGENTIC11 = 14** — CLAUDE.md:20 runtime list (13 names) does not match opencode.jsonc `mcp.*` keys (9 keys). Mismatches:
  - `brain-mcp` in CLAUDE.md → `brain-mcp-node` in opencode.jsonc/mcp.yaml
  - `factory-mcp` in CLAUDE.md → `factory-mcp-node` in opencode.jsonc/mcp.yaml
  - `ticket-mcp` in CLAUDE.md → `ticket-mcp-node` in opencode.jsonc/mcp.yaml
  - `docfork`, `github-mcp`, `sequential-thinking`, `webresearch` listed in CLAUDE.md but **removed** from mcp.yaml (2026-08-30, stale disabled overrides with no users)
  - `codebase-memory-mcp` present in opencode.jsonc but **missing** from CLAUDE.md list
- **G-AGENTIC13 = 4** — dead `mcp__*` references in SKILL.md files pointing to non-existent server names (e.g. `mcp__factory-mcp__` when the registry has `factory-mcp-node`)

Explicitly **NOT in scope**: mcp-sync clobbering concerns. `scripts/mcp-sync.sh:43-44` preserves everything outside the mcp block, so `skills.paths` + compaction survive regeneration (verified).

## Proposal

1. **Sync CLAUDE.md:20** — Replace the opencode runtime MCP list with the exact keys from `mcp.yaml` clients (excluding cluster-only and disabled-only entries) that match opencode.jsonc keys.
2. **Resolve dead `mcp__*` refs** — Replace `mcp__factory-mcp__` with `mcp__factory-mcp-node__` in `.opencode/skills/mishap-tracker/SKILL.md`.
3. **Verify** — G-AGENTIC11 = 0, G-AGENTIC13 = 0 on a machine with python3 (G-AGENTIC02/14 are blank locally on Windows — python3 not installed).

## Files Changed

| File | Change |
|------|--------|
| `CLAUDE.md` (line 20) | Replace MCP runtime list to match mcp.yaml clients ∩ opencode.jsonc keys |
| `.opencode/skills/mishap-tracker/SKILL.md` (line 647) | `mcp__factory-mcp__` → `mcp__factory-mcp-node__` |

## Delta Specs

No spec delta needed — this is a documentation/registry consistency fix. The SSOT is `mcp.yaml`; CLAUDE.md and SKILL.md must reflect it.

## Success Criteria

- CLAUDE.md:20 runtime list matches mcp.yaml clients (opencode harness) ∩ opencode.jsonc mcp keys exactly
- Zero `mcp__<nonexistent-server>` refs in SKILL.md files
- G-AGENTIC11 = 0, G-AGENTIC13 = 0 (on machine with python3)
