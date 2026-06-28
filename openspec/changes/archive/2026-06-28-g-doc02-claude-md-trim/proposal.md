# Proposal: g-doc02-claude-md-trim

_Ticket: T001296_

## Why

`CLAUDE.md` is loaded on every request sent to Claude Code. At 273 lines it is 37% larger than the project's ≤200-line health target. The `## Gotchas & Footguns` section alone accounts for 109 of those lines (40%) and consists almost entirely of prose that describes operational edge-cases — not routing decisions or workflow entry points. The routing table, default workflow block, and architecture key-component summary are buried below the footgun wall, making the most frequently needed context harder to reach.

The problem compounds over time: every new gotcha added to `CLAUDE.md` pushes it further past the budget. A dedicated reference file breaks that coupling — new gotchas land in `docs/superpowers/references/gotchas-footguns.md` and cost zero tokens against the `CLAUDE.md` budget.

## What

1. Create `docs/superpowers/references/gotchas-footguns.md` containing the full content of the current `## Gotchas & Footguns` section (lines 165-273 of `CLAUDE.md`), formatted as a standalone reference document with a clear header, section index, and all twelve sub-sections preserved verbatim.

2. Replace the 109-line `## Gotchas & Footguns` block in `CLAUDE.md` with a short pointer block (~8 lines) that names the reference file and lists the covered sub-topics so agents know what is there without reading it upfront.

3. Verify the measure command `wc -l < CLAUDE.md` reports ≤200.

No content is deleted — all gotcha knowledge moves to the reference file. The `REFERENCE-GOTCHAS.md` in auto-memory is unrelated (it holds incident-derived notes); this change creates the canonical source-of-truth under `docs/superpowers/references/` which is already the home for `envsubst-variable-management.md`, `shared-infrastructure-security.md`, and similar deep-dive documents.

## Impact

**New files:**
- `docs/superpowers/references/gotchas-footguns.md` — full Gotchas & Footguns reference (~115 lines with header overhead)

**Changed files:**
- `CLAUDE.md` — Gotchas block replaced by pointer block; target line count ≤200

**Risks:**
- Low. All content is preserved in the reference file; no operational knowledge is lost. Agents that need gotcha detail follow the pointer.
- The `docs/` directory holds Markdown source compiled by `node scripts/build-docs.mjs`; adding a new `.md` file there does not trigger any build unless it is explicitly imported by `build-docs.mjs`. The reference lives under `docs/superpowers/references/` alongside existing files that are also not auto-included, so no build side-effect occurs.

**Out of scope:**
- Reducing other sections of `CLAUDE.md` (Architecture, CI/CD, Running Tasks). The Gotchas block alone provides the required 73-line reduction.
- Updating auto-memory `REFERENCE-GOTCHAS.md` — that file is gitignored, machine-local, and managed separately by the memory harness.
- Adding the new reference to the `build-docs.mjs` pipeline — that is a separate docs improvement goal.
