# OpenSpec — Project Conventions

This repo uses an **OpenSpec-format-compatible native workflow**. We adopt OpenSpec's
directory layout, delta format, and lifecycle verbatim, but implement the verbs ourselves
in `scripts/openspec.sh` (wired to `scripts/ticket.sh` + the Software Factory) instead of
installing the `openspec` npm CLI. Switch path: `npm i -g openspec` runs as a drop-in
because the files are already conformant — kept cheap by the `task test:openspec` gate.

## Layout

- `openspec/specs/<capability>.md` — the living SSOT (one capability per file).
- `openspec/changes/<kebab-slug>/` — one active change == one ticket:
  - `proposal.md` (WHY + WHAT, = brainstorming output)
  - `design.md` (technical approach, optional)
  - `tasks.md` (implementation checklist, = writing-plans output, Factory input)
  - `specs/<capability>.md` (spec DELTA against the SSOT)
- `openspec/changes/archive/<YYYY-MM-DD>-<slug>/` — archived after the ticket reaches `done`;
  its delta is merged into the SSOT.

## Format conformance (the two things that guarantee switch-compatibility)

- SSOT / spec files: `### Requirement: <Name>` (H3, "SHALL" style) →
  `#### Scenario: <Name>` (H4) with `- **GIVEN/WHEN/THEN/AND**` bullets.
- Delta files: H2 operation headers `## ADDED Requirements` / `## MODIFIED Requirements` /
  `## REMOVED Requirements`, each followed by the same Requirement/Scenario structure.

## Lifecycle ↔ ticket-state mapping

| OpenSpec phase | Ticket state |
|---|---|
| proposed | `triage` / `planning` |
| approved (ready) | `plan_staged` |
| queued | `backlog` |
| active | `in_progress` / `in_review` / `qa_review` / `awaiting_deploy` |
| archived | `done` (= deployed + verified in prod) |

**Cutover:** new work from 2026-06-16 uses `openspec/`. The 211 legacy specs + 35 plans under
`docs/superpowers/` stay as a historical archive and are NOT migrated.
