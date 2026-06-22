# Prompt Snippet: Review Lens Hard Constraints

## HARD CONSTRAINT — BEFORE REVIEWING

- **ONLY** report findings on lines that are marked with `+` in the diff. Lines
  shown as unchanged context (` `) or removed (`-`) are FORBIDDEN as finding targets.
  If a chunk of context code looks buggy but the diff does not change it, do NOT flag it.
- **NEVER** report style, naming, formatting, whitespace, indentation, typos, or
  cosmetic issues — those have zero behavioral impact and are discarded automatically.
- Every finding MUST include a numeric `confidence` field (0.0–1.0). If you are
  uncertain, assign a LOW confidence rather than omitting the field. Findings
  without confidence or with confidence < 0.6 may be automatically discarded.

---
*Source: `.claude/lib/prompts/review-lens-format.md` — included verbatim at the top of each review lens prompt.*
