---
name: verification-before-completion
description: "[STUB] Built-in skill — redirects to inlined alternative. See skill body for details."
---

# verification-before-completion — STUB / Redirect

This skill is a **built-in superpower** of Claude Code and is not shipped as a standalone file
in this repository.

## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Built-in — available as `verification-before-completion` via the Claude Code CLI |
| **opencode** | Not available as a separate skill. The equivalent verification steps are **inlined** in `dev-flow-execute/SKILL.md` (step 3) and documented in the shared reference `references/verification-block.md` |
| **agy** | Treat the opencode path as authoritative — verification is entirely bash-driven (`task test:changed`, `task freshness:*`) and framework-agnostic. |

## What this stub is for

This stub exists so that skill-loading calls to `verification-before-completion` do not fail
with a "skill not found" error. It contains no executable workflow — the real logic lives
in the skills listed above.

If you are running in **Claude Code**, invoke the built-in superpower directly.
If you are running in **opencode** or **agy**, use the `verification-block.md` reference and
the inlined steps in `dev-flow-execute/SKILL.md` instead.
