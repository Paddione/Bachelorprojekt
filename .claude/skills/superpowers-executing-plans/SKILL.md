---
name: superpowers:executing-plans
description: "[STUB] Built-in skill — redirects to inlined alternative. See skill body for details."
---

# superpowers:executing-plans — STUB / Redirect

This skill is a **built-in superpower** of Claude Code and is not shipped as a standalone file
in this repository.

## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Built-in — available as `superpowers:executing-plans` via the Claude Code CLI |
| **opencode** | Not available as a separate skill. The plan-execution logic is **inlined** in `dev-flow-execute/SKILL.md` (steps 2–8) and in `opencode-flow-execute/SKILL.md` |
| **agy** | Treat the opencode path as authoritative — all CLI tools (`gh`, `git`, `kubectl`, `task`, `bash scripts/`) and MCP tool calls work identically. Plan-execution is entirely bash/MCP-driven and framework-agnostic. |

## What this stub is for

This stub exists so that skill-loading calls to `superpowers:executing-plans` do not fail
with a "skill not found" error. It contains no executable workflow — the real logic lives
in the skills listed above.

If you are running in **Claude Code**, invoke the built-in superpower directly.
If you are running in **opencode** or **agy**, use the inlined execution steps in the dev-flow
or opencode-flow skills instead.
