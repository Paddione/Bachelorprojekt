# Prompt Snippet: Diff Analysis Scope

Review the provided git diff. The user message lists the EXACT changed line
ranges per file — confine your findings to those lines.

- Lines marked with `+` — new/changed lines — ONLY valid finding targets
- Lines marked with ` ` (space) — unchanged context — do NOT flag
- Lines marked with `-` — removed lines — do NOT flag

---
*Source: `.claude/lib/prompts/diff-analysis-context.md` — include at the top of the Review Scope section in lens prompts.*
