---
title: "knowledge-mcp-consol — Implementation Plan"
ticket_id: T900998
domains: [agent-skills, scripts, knowledge-graph]
status: draft
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# knowledge-mcp-consol — Implementation Plan

Konsolidierter knowledge-MCP-Tool-Plan (T900998): Toolset-Delta (S1, Basis
staged T900983), devflow-mcp-Delta (S2, Basis staged T900985) und Embed-Reste
(S3, nach T900993-Merge-first) als Mono-Plan mit disjunkten Stream-Partials.
Staged Pläne T900985/T900983 werden superseded (P4). Messung, Architektur und
Entscheidungen D1–D8: `design.md`.

_Ticket: T900998_

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| P1 | tasks.d/p1-toolset-delta.md | impl | scripts/toolset/, docs/agent-guide/registry/ |  |
| P2 | tasks.d/p2-devflow-delta.md | impl | scripts/devflow-mcp/ |  |
| P3 | tasks.d/p3-embed-rest.md | impl | scripts/mcp/, docs/brain/ |  |
| P4 | tasks.d/p4-supersede-staged.md | impl | .agents/plans/devflow-mcp/, .agents/plans/toolset-tool-level/ |  |
| P5 | tasks.d/p5-stream-tests.md | tests | tests/spec/devflow-mcp/, tests/spec/toolset-registry/ | P1,P2,P3 |

## File Structure

- `.agents/plans/knowledge-mcp-consol/proposal.md` — WARUM + WAS
- `.agents/plans/knowledge-mcp-consol/design.md` — freigegebene Spec
- `.agents/plans/knowledge-mcp-consol/intel.json` — deterministisches Bundle
- `.agents/plans/knowledge-mcp-consol/tasks.d/p1-toolset-delta.md` — S1
- `.agents/plans/knowledge-mcp-consol/tasks.d/p2-devflow-delta.md` — S2
- `.agents/plans/knowledge-mcp-consol/tasks.d/p3-embed-rest.md` — S3 (nach T900993-Merge)
- `.agents/plans/knowledge-mcp-consol/tasks.d/p4-supersede-staged.md` — Archivierung
- `.agents/plans/knowledge-mcp-consol/tasks.d/p5-stream-tests.md` — Tests/Guards

## Verify (final)

1. `task test:changed` grün (BATS je Stream: devflow-mcp, toolset-registry, cbm)
2. `task freshness:regenerate` ausgeführt
3. `task freshness:check` grün
4. Kollisions-Check: keine zwei Partials teilen eine Datei
5. Staged Pläne T900985/T900983 archiviert + referenziert, keine Overlaps
