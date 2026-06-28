# g-doc02-claude-md-trim

## Purpose

Keep `CLAUDE.md` within a ≤200-line token budget so that routing rules, workflow entry points, and architecture pointers remain readable on every request. Operational edge-case detail (Gotchas & Footguns) is maintained in a dedicated reference file under `docs/superpowers/references/` and linked from `CLAUDE.md` via a compact pointer block.

## ADDED Requirements

### Requirement: The measure command `wc -l < CLAUDE

The system SHALL the measure command `wc -l < CLAUDE.md` is reproducible and returns the authoritative line count. The health-goals script invokes this command directly; no approximation or alternative metric is accepted.
- REQ-2: The target line count is ≤200. Reducing the `## Gotchas & Footguns` block (109 lines) to a pointer block (~14 lines) yields a reduction of ~95 lines, bringing the total from 273 to approximately 178 lines — within the target with margin for future minor additions.
- REQ-3: No operational content is deleted. All twelve sub-sections of the Gotchas & Footguns block are preserved verbatim in `docs/superpowers/references/gotchas-footguns.md`.
- REQ-4: The pointer block in `CLAUDE.md` lists every covered sub-topic by name so an agent reading `CLAUDE.md` knows which gotcha is available in the reference file without opening it.
- REQ-5: `docs/superpowers/references/gotchas-footguns.md` is committed alongside the `CLAUDE.md` change in the same PR so the pointer is never broken.

## Acceptance Criteria

- THEN `wc -l < CLAUDE.md` returns a value ≤200.
- THEN `docs/superpowers/references/gotchas-footguns.md` exists and contains ≥12 `###`-level sub-sections matching the original Gotchas block.
- THEN `CLAUDE.md` contains a line referencing `docs/superpowers/references/gotchas-footguns.md`.
- THEN `bash scripts/health-goals-check.sh --only=G-DOC02` exits 0 (green).
- THEN `task test:changed` passes with no new failures.
- THEN `task freshness:check` passes (freshness artifacts regenerated before check).
