---
title: "software-factory-decommission — Implementation Plan"
ticket_id: T900399
domains: [infra-ops, database-specialist, scripts, repo-hygiene, toolset-curate, website-specialist, testing]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# software-factory-decommission — Implementation Plan

_Ticket: T900399 — Vollständiger Rückbau des Software-Factory-Subsystems (systemd-Units, K8s-Runner, Dispatcher-Pipelines, MCP-Server, DB-Tabellen und Tests)._

## File Structure

```
k3d/dev-stack/kustomization.yaml
k3d/dev-pod/deployment.yaml
scripts/migrate-db.mjs
scripts/migrations/2026-09-26-factory-decommission.sql
Taskfile.yml
taskfiles/Taskfile.agents.yml
scripts/ticket.sh
docs/agent-guide/registry/mcp.yaml
docs/agent-guide/registry/capabilities.yaml
docs/agent-guide/registry/skills.yaml
docs/agent-guide/registry/tools.yaml
docs/agent-guide/registry/goals.yaml
docs/agent-guide/registry/networks.yaml
docs/agent-guide/registry/agents.yaml
components/website/src/pages/sdlc/api/factory-control.ts
components/website/src/pages/sdlc/api/factory/force-tick.ts
components/website/src/pages/sdlc/api/factory/parallel-status.ts
tests/spec/software-factory/decommission-guard.bats
openspec/specs/software-factory.md
```

## Partials

| id | plan | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-services-k8s.md | impl | k3d/dev-stack/kustomization.yaml, k3d/dev-pod/deployment.yaml | |
| p2 | tasks.d/p2-db-decouple.md | impl | scripts/migrate-db.mjs, scripts/migrations/2026-09-26-factory-decommission.sql | p1 |
| p3 | tasks.d/p3-scripts-tooling.md | impl | Taskfile.yml, taskfiles/Taskfile.agents.yml, scripts/ticket.sh | p1,p2 |
| p4 | tasks.d/p4-registry-cockpit.md | impl | docs/agent-guide/registry/mcp.yaml, docs/agent-guide/registry/capabilities.yaml, docs/agent-guide/registry/skills.yaml, docs/agent-guide/registry/tools.yaml, docs/agent-guide/registry/goals.yaml, docs/agent-guide/registry/networks.yaml, docs/agent-guide/registry/agents.yaml, components/website/src/pages/sdlc/api/factory-control.ts, components/website/src/pages/sdlc/api/factory/force-tick.ts, components/website/src/pages/sdlc/api/factory/parallel-status.ts | p3 |
| p5 | tasks.d/p5-tests-specs.md | tests | tests/spec/software-factory/decommission-guard.bats, openspec/specs/software-factory.md | p1,p2,p3,p4 |

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Run the decommission guard before decommissioning the factory subsystem:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/decommission-guard.bats
# expected: FAIL (red — the fix is not yet implemented)
```

- [ ] **Fix-Step (GREEN).** Decommission services, manifests, database tables, tooling, and registry entries according to partials p1 through p5. The test must now pass:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/decommission-guard.bats
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
