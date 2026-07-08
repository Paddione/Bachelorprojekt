---
name: test-driven-development
description: "[STUB] Built-in skill — redirects to inlined alternative. See skill body for details."
---

# test-driven-development — STUB / Redirect

This skill is a **built-in superpower** of Claude Code and is not shipped as a standalone file
in this repository.

## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Built-in — available as `test-driven-development` via the Claude Code CLI |
| **opencode** | Not available as a separate skill. The TDD workflow is **inlined** in `dev-flow-execute/SKILL.md` (step 2, red-green principle) and `vitest/SKILL.md` |
| **agy** | Treat the opencode path as authoritative — TDD is entirely test-framework-driven (vitest, BATS, Playwright) and framework-agnostic. |

## What this stub is for

This stub exists so that skill-loading calls to `test-driven-development` do not fail
with a "skill not found" error. It contains no executable workflow — the real logic lives
in the skills listed above.

If you are running in **Claude Code**, invoke the built-in superpower directly.
If you are running in **opencode** or **agy**, use the inlined TDD steps in the dev-flow
skills and the vitest skill instead.
