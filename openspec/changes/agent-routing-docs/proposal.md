# Proposal: agent-routing-docs

## Why

1/6–4/6 rebuilt the recall stack (K1 merge-driven embeddings, K3
auto-refreshed graph, K4 mirror retired) and 5/6 removes the last
reading-docs machinery — but no place tells agents how to route a
question across the new layers. `AGENTS.md:78` still says "K3 first,
always"; capability entries still advertise "Wiki-Suche"; the deleted
pipeline is still documented as target state (`docs/runbooks/brain-ingest.md`,
`system-audit` skill, registry entries). Agents fall back to grep or
dead ends instead of routing recall → precision → doctrine.

## What Changes

- New routing page `docs/brain/recall-routing.md`: decision tree by
  query type (known symbol → K3 graph; semantic question → K1
  embeddings; doctrine/process → K4-rumpf in `docs/`), default order
  K1→K3→K4, freshness table (K1 merge-coupled, K3 ≤~1h bound, K4
  authoring-time), ownership note (epic-owned, no person owner).
- Routing wired into the agent surfaces: `AGENTS.md:78` (layer choice
  short form), `capabilities.yaml` (`use_when`/`avoid_when` per layer,
  stale "Wiki-Suche" fixed), `mcp-tool-guide.md` (depth reference),
  3 prompt lines (orchestrator, primary-agent, glimmer-primary);
  generated maps/docs regrown via `toolset:map` + `agent-guide:emit`.
- Sweep (drive-by, in no other scope): delete
  `docs/runbooks/brain-ingest.md` (201 lines, describes the deleted
  pipeline); remove `skills.yaml` brain-ingest entry, `system-audit`
  brain-wiki section, `deploy-routing.md` build-docs lines;
  fix `k5-openspec.md` diagram arrow, `k2-bge-paare.md` script ref,
  `gesamtbild.md` K4 row, `CLAUDE.md:27` runtime list; `k1-vector-db.md`
  2/6 addendum (merge-driven flow replaces post-commit hook).
- New guard `tests/spec/routing-docs-guard.bats` (absence of swept
  refs + presence of routing page/table).

Path note (Schritt 0): dev-flow-plan, not chore — capability entries
drive agent tool selection (behavior), a new CI guard ships, and the
change carries a spec delta plus a staged-plan handoff to the executor.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `openspec/specs/agent-skills.md`: recall layer-choice requirement added.

## Impact

- Docs-only: 1 new page, ~12 doc/registry/prompt edits, 1 runbook
  deletion, 1 new guard. No runtime, no CI workflow, no scripts.
- Generated files (`toolset-map.md`, `20-werkzeuge.md`,
  `agent-guide.generated.json`) regrown via keeper tasks, never
  hand-edited.
- Order: implements after 5/6 (ordering gate in the plan, same
  pattern as 4/6 E6); 5/6-owned lines (`CLAUDE.md:128,147`) untouched.

_Ticket: T900453_
