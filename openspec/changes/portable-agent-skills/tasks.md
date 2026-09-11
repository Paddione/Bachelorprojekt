---
title: "portable-agent-skills — Implementation Plan"
ticket_id: T900151
domains: [agent-skills, developer-experience]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# portable-agent-skills — Implementation Plan

_Ticket: T900151_

## Prior art and scope

This is a **feature**: it changes the discovered skill catalog and validation contract for four agent harnesses. The existing `unify-dev-flow-skill-names` (T014086) and `sdlc-autopilot-skill-adoption` (T016420) landed already; their still-active change directories are stale and are not implementation dependencies. The applicable SSOT is `openspec/specs/agent-skills.md`; its `.opencode`-SSOT and pairwise-shim requirements are superseded by this delta.

## File Structure

```
docs/agent-guide/registry/skills.yaml                 # new, skill inventory authority
scripts/agent-skills/project.mjs                       # new, check/write projection engine
.agents/skills/                                        # portable canonical skill corpus
.claude/skills/                                        # Claude native skills and declared adapters
.opencode/skills/                                      # OpenCode native skills and declared projections
docs/agent-guide/registry/agents.yaml
docs/agent-guide/registry/tools.yaml
docs/agent-guide/registry/capabilities.yaml
scripts/agent-guide/validate.mjs
scripts/toolset/collect.mjs
tests/spec/agent-skills/portable-inventory.bats
tests/spec/agent-skills/skill-path-references.bats
tests/spec/agent-skills.bats
tests/spec/harness-workflow-split.bats
docs/agent-guide/maps/tools-map.md
docs/agent-guide/maps/toolset-map.md
```

## Partials

| Partial | Depends on | Scope / exclusive targets |
|---|---|---|
| p1 — inventory and projection engine | — | `docs/agent-guide/registry/skills.yaml`, `scripts/agent-skills/project.mjs`, `tests/spec/agent-skills/portable-inventory.bats` |
| p2 — classify and project skill corpus | p1 | `.agents/skills/**`, `.claude/skills/**`, `.opencode/skills/**` |
| p3 — catalog enforcement and documentation | p1, p2 | `docs/agent-guide/registry/{agents,tools,capabilities}.yaml`, `scripts/agent-guide/validate.mjs`, `scripts/toolset/collect.mjs`, `tests/spec/agent-skills.bats`, `tests/spec/agent-skills/skill-path-references.bats`, `tests/spec/harness-workflow-split.bats`, `docs/agent-guide/maps/{tools-map,toolset-map}.md` |

Each partial owns disjoint paths. p2 may not redefine registry schema or test engine behaviour; p3 consumes p1's inventory and p2's materialized catalog but may not alter either projection implementation or skill bodies.

## Verify (RED → GREEN)

- [ ] **p1 RED — registry rejects an incomplete projection.** Add `tests/spec/agent-skills/portable-inventory.bats` with a fixture that declares a portable skill for all four harnesses but omits its Codex projection. Run only that test before the engine exists; it must fail because the current repository has no authoritative registry. `expected: FAIL (red — no registry-backed four-harness catalog exists)`

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/portable-inventory.bats
# expected: FAIL (red — portable inventory validator is absent)
```

- [ ] **p1 GREEN — implement registry and check-only projection engine.** Define schema and native/portable/adapter classifications; produce deterministic diagnostics for missing, unexpected, dangling, non-rationalized, and non-identical projections. Add explicit write mode guarded by a command flag, but use check mode in tests and CI.

- [ ] **p2 — migrate corpus without changing public skill IDs.** Inventory every tracked skill, move shared bodies to `.agents/skills`, create only declared projections/adapters in the other two directories, and leave native/vendor content in place with provenance and rationale. Rewrite shared prose to capability-oriented terms; put tool-name mappings only in adapters. Regenerate the projection catalog and prove the expected four harness views.

- [ ] **p3 — replace legacy pairwise guards and publish truthful catalogs.** Extend agent-guide schema with Codex and explicit harness sets, collect skills from the registry/projections, migrate BATS guards away from the `.opencode_only` list, preserve dead-path coverage, and regenerate maps. Add positive and negative cases for missing Codex exposure, undeclared override, and accidental native-skill exposure.

- [ ] **Final Verification.** Run targeted guards, then the mandatory CI gates:

```bash
node scripts/agent-skills/project.mjs --check
node scripts/agent-guide/validate.mjs
tests/unit/lib/bats-core/bin/bats \
  tests/spec/agent-skills/portable-inventory.bats \
  tests/spec/agent-skills/skill-path-references.bats \
  tests/spec/agent-skills.bats \
  tests/spec/harness-workflow-split.bats
task test:changed
task freshness:regenerate
task freshness:check
```
