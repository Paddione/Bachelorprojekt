# Proposal: k4-surgery

## Why

K4 is 85 % generated spec mirror: `ssot-specs` (130 files, ~3 MB)
dominates the ingest corpus, and a `--from-scratch` run is effectively a
spec re-ingest. ADR-009 (points 3+7) retires the mirror: the replacement
recall layers (K1 merge-driven embeddings over code+specs+docs, K3
auto-refreshed graph) make the cross-repo wiki pipeline obsolete. Every
week the pipeline survives, agents pay LLM ingest cost and read a second,
drifting copy of the specs.

## What Changes

- Delete the ingest pipeline: `scripts/brain-ingest*.sh` (orchestrator,
  worklist, transform, MOC, prune, restamp, swap, reset, coverage),
  `scripts/brain-group-match.sh`, `scripts/brain-source-provenance.sh`,
  `scripts/brain-page-metadata.py`, `scripts/brain-lifecycle-audit.py`,
  `scripts/brain-expertise.py`, `scripts/brain-bootstrap.sh`,
  `scripts/brain-merge-hook.sh` + `.github/workflows/brain-merge-hook.yml`,
  `scripts/brain/ingest-sources.yaml` (all code consumers deleted with
  it), the `brain-ingest` skill, and the `brain:ingest:*` /
  `brain:expertise:*` / `brain:lifecycle` tasks (Taskfile.brain.yaml
  shrinks to the `brain:chunk` keeper).
- Retire `brain-mcp` (decision: Retire, not Repoint — K1/K3 replace its
  recall; no local wiki checkout exists on this machine anyway):
  `scripts/brain-mcp-server.py`, `scripts/brain-mcp-node/`, registry
  entries (mcp.yaml, `.mcp.json`, opencode.jsonc, capabilities wiring,
  toolset-map use_when lines), `brain:mcp` tasks.
- Cockpit unwiring: `brain-links.ts`, `pages/sdlc/api/cockpit/brain.ts`
  (no frontend calls it — grep-verified), their vitest files,
  `k3d/brain.yaml` + kustomization ref.
- Health goal G-BRAIN14 goes with the worklist it checks
  (health-goals-check.sh section, goals.md entry, integrity guard).
- Keepers (explicitly NOT deleted): `scripts/brain-chunk.sh` (needed by
  `brain-verify-claims.sh`), `scripts/brain-verify-refs.sh` /
  `brain-verify-claims.sh` (used during surgery for link checking),
  `scripts/brain-retrieval-eval.py` + eval set (owned by 1/6).
- Authored core: already lives in `docs/` (ADRs, runbooks, gotchas,
  maps) — the plan verifies via `gh` that no wiki-only authored pages
  exist and retracts any found (fail-closed first task).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `openspec/specs/brain-k4-brain-wiki.md`: pipeline/MCP/delivery
  requirements removed, mirror-absence added; chunking (REQ-k4-04) and
  offline eval stay.
- `openspec/specs/brain-foundation.md`: REQ-008 (ssot-specs glob) removed.
- `openspec/specs/sdlc-cockpit.md`: brain-derivation + brain-ingress
  requirements removed.

## Impact

- ~20 scripts + 1 workflow + 1 manifest + 1 skill + registry/cockpit
  wiring deleted; ~15 BATS guards deleted or rewritten to assert absence.
- No brand runtime change; `docs.*.de` untouched (5/6); Paddione/brain
  archive click stays an owner act (out of scope).
- Ordering: implements AFTER 2/6 + 3/6 (replacement fresh first);
  planning ahead is safe because the plan only references their
  committed proposals, not their code.

_Ticket: T900451_
