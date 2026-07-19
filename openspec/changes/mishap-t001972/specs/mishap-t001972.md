---
title: "mishap-t001972 — ticket-mcp component, openspec create-new, main-checkout guard"
ticket_id: T001972
---

## ADDED Requirements

### Requirement: ticket-mcp triage_ticket preserves component

WHEN `ticket-mcp_triage_ticket` is invoked without a `component` argument
AND the ticket already has a non-null `component`
THEN the SQL UPDATE MUST keep the existing `component` value
(coalesce semantics, not overwrite-with-NULL).

### Requirement: openspec-merge --create-new merges delta into fresh SSOT

WHEN `scripts/openspec-merge.mjs apply <delta> <ssot> --create-new` runs
AND `<ssot>` does not exist
THEN the function MUST write a fresh SSOT skeleton AND merge all `## ADDED
Requirements` blocks from `<delta>` into it
AND the resulting SSOT MUST contain at least one `### Requirement:` block
(validated by `scripts/openspec-validate.ts`).

### Requirement: openspec archive forbidden in main checkout

WHEN `task openspec:archive` or `scripts/openspec.sh archive` is executed
THEN the operation MUST only run inside a `.worktrees/*` worktree on a
`chore/*` branch
AND the pre-commit hook MUST block direct execution in the primary
`/home/patrick/Bachelorprojekt` checkout if uncommitted archive artifacts
(under `openspec/specs/` or `openspec/changes/`) are detected.
