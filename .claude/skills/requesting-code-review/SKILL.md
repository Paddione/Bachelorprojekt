---
name: requesting-code-review
description: "[STUB] Built-in skill — redirects to inlined alternative. See skill body for details."
---

# requesting-code-review — STUB / Redirect

This skill is a **built-in superpower** of Claude Code and is not shipped as a standalone file
in this repository.

## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Built-in — available as `requesting-code-review` via the Claude Code CLI |
| **opencode** | Not available as a separate skill. The equivalent review steps are **inlined** in `dev-flow-execute/SKILL.md` (step 3.8), with an alternative path using `pr-review-toolkit:review-pr` or a review subagent |
| **agy** | Treat the opencode path as authoritative. Code review is a manual/git-based process — framework-agnostic. |

## What this stub is for

This stub exists so that skill-loading calls to `requesting-code-review` do not fail
with a "skill not found" error. It contains no executable workflow — the real logic lives
in the skills listed above.

If you are running in **Claude Code**, invoke the built-in superpower directly.
If you are running in **opencode** or **agy**, use the inlined review steps in
`dev-flow-execute/SKILL.md` instead.
