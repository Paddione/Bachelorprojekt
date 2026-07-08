---
name: superpowers:brainstorming
description: "[STUB] Built-in skill — redirects to inlined alternative. See skill body for details."
---

# superpowers:brainstorming — STUB / Redirect

This skill is a **built-in superpower** of Claude Code and is not shipped as a standalone file
in this repository.

## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Built-in — available as `superpowers:brainstorming` via the Claude Code CLI |
| **opencode** | Not available as a separate skill. Equivalent functionality is **inlined** in `opencode-flow-plan/SKILL.md` (steps A.3–A.5) and in `dev-flow-plan/SKILL.md` (step A.4, which contains the brainstorming workflow directly) |
| **agy** | Treat the opencode path as authoritative — all CLI tools (`gh`, `git`, `kubectl`, `task`, `bash scripts/`) and MCP tool calls work identically. The brainstorming workflow steps are bash/MCP-based and framework-agnostic. |

## What this stub is for

This stub exists so that skill-loading calls to `superpowers:brainstorming` do not fail
with a "skill not found" error. It contains no executable workflow — the real logic lives
in the skills listed above.

If you are running in **Claude Code**, invoke the built-in superpower directly.
If you are running in **opencode** or **agy**, use the inlined brainstorming steps in the
dev-flow or opencode-flow skills instead.
