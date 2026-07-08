---
name: superpowers:writing-plans
description: "[STUB] Built-in skill — redirects to inlined alternative. See skill body for details."
---

# superpowers:writing-plans — STUB / Redirect

This skill is a **built-in superpower** of Claude Code and is not shipped as a standalone file
in this repository.

## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Built-in — available as `superpowers:writing-plans` via the Claude Code CLI |
| **opencode** | Not available as a separate skill. The plan-writing logic is **inlined** in `dev-flow-plan/SKILL.md` (step 3.7 for plan creation, step 3.8 for quality gates) and in `opencode-flow-plan/SKILL.md` |
| **agy** | Treat the opencode path as authoritative — all CLI tools (`gh`, `git`, `kubectl`, `task`, `bash scripts/`) and MCP tool calls work identically. Plan-writing uses bash/MCP-based tooling that is framework-agnostic. |

## What this stub is for

This stub exists so that skill-loading calls to `superpowers:writing-plans` do not fail
with a "skill not found" error. It contains no executable workflow — the real logic lives
in the skills listed above.

If you are running in **Claude Code**, invoke the built-in superpower directly.
If you are running in **opencode** or **agy**, use the inlined plan-writing steps in the
dev-flow or opencode-flow skills instead.
