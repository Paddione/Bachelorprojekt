---
title: "devmesh-k3d-decommission — Implementation Plan"
ticket_id: T900120
domains: [infra, testing]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: [devmesh-dev-stack]
---

# devmesh-k3d-decommission — Implementation Plan

_Ticket: T900120_ · Programm T900115 (ADR-008 SP-5) · blocked_by: T900118 (SP-3)

Quellen: `proposal.md`, `design.md`, `specs/local-dev-mesh.md`, `specs/sdlc-isolation.md`,
ADR-008 Nachtrag 2026-09-11, `.claude/skills/references/plan-quality-gates.md`.

**Ziel:** Vollständiger Abbau des verbliebenen lokalen k3d-Clusters `mentolder-dev` auf `ws-ubuntu-1`.
Zwei Kubeconfig-Kontexte bleiben aktiv: `fleet` (Prod, Ticket-DB of record) und `devmesh` (Entwicklung).
Kein Code, kein Skript, kein Tooling verweist mehr auf `k3d-mentolder-dev` oder legt k3d-Cluster an.

**Reihenfolge:** `p6-tests` zuerst (RED nachweisen), danach `p1-context-defaults`, `p2-sdlc-tooling`,
`p3-docs`, `p4-spec-deltas` und `p5-acceptance-live` (Teil A im PR; Teil B sind Live-Tasks nach dem Merge).

## File Structure

```
NEW:
  scripts/devmesh/acceptance.sh                               (p5)
  scripts/devmesh/k3d-teardown.sh                             (p5)
  openspec/changes/devmesh-k3d-decommission/specs/batch-factory-pipeline-robustness.md (p4)
  openspec/changes/devmesh-k3d-decommission/specs/ticket-system.md                      (p4)
  openspec/changes/devmesh-k3d-decommission/specs/sdlc-cockpit.md                       (p4)
  tests/spec/local-dev-mesh/no-k3d-context.bats               (p6)
  tests/spec/local-dev-mesh/factory-ctx-default.bats          (p6)
  tests/spec/local-dev-mesh/k3d-acceptance-gate.bats          (p6)
CHANGED:
  scripts/factory/lib.sh                                      (p1)
  scripts/factory/conflict-check.sh                           (p1)
  scripts/factory/sandbox-run.sh                              (p1)
  scripts/factory/wakeup.sh                                   (p1)
  scripts/ticket.sh                                           (p1)
  scripts/vda/ticket/_ctx-guard.sh                            (p1)
  scripts/runtime-drift-check.sh                              (p1)
  scripts/lib/llm-stack-measure.sh                            (p1)
  scripts/lib/promote-phases.sh                               (p1)
  scripts/session-hub.sh                                      (p1)
  scripts/finetune/eval-runner.sh                             (p1)
  scripts/finetune/model-registry.sh                          (p1)
  scripts/finetune/stat-collector.sh                          (p1)
  scripts/knowledge/kalibrierung-retrieval.mjs                (p1)
  scripts/mcp-gateway/k3d-postgres-forward.service            (p1)
  scripts/mcp-gateway/watchdog-check.sh                       (p1)
  .github/workflows/arbitration.yml                           (p1)
  compose.dev.yaml                                            (p1)
  components/website/src/lib/tickets/final-grilling.ts        (p1)
  environments/.secrets/.ssh/config                           (p1)
  taskfiles/Taskfile.sdlc.yml                                 (p2)
  scripts/sdlc/health-gate.sh                                 (p2)
  scripts/vda/ticket/_ticket-core.sh                          (p2)
  Taskfile.yml                                                (p2)
  taskfiles/Taskfile.dev-stack.yml                            (p2)
  taskfiles/Taskfile.brainstorm.yml                           (p2)
  taskfiles/Taskfile.llm.yml                                  (p2)
  taskfiles/Taskfile.staging.yml                              (p2)
  scripts/sdlc/migrate-tickets.sh                             (p2)
  scripts/sdlc/backup-tickets.sh                              (p2)
  scripts/sdlc-auth-mode.sh                                   (p2)
  scripts/sdlc-sync-oidc-secret.sh                            (p2)
  CLAUDE.md                                                   (p3)
  .claude/agents/bachelorprojekt-ops.md                       (p3)
  docs/superpowers/references/gotchas-footguns.md             (p3)
  docs/sdlc-stack/README.md                                   (p3)
  docs/sdlc-stack/e3-cutover.md                               (p3)
  docs/sdlc-stack/prod-auth.md                                (p3)
  docs/bereitstellungsdetails.md                              (p3)
  docs/fleet-2026-05-31-what-changed.md                       (p3)
  scripts/dev-host-units/README.md                            (p3)
  docs/superpowers/specs/2026-05-30-dev-mcp-public-route-design.md (p3, verschoben)
  docs/superpowers/specs/2026-06-11-staging-on-demand-design.md    (p3, verschoben)
  docs/superpowers/specs/2026-07-01-t001341-traefik-hostport-clientip-design.md (p3, verschoben)
  docs/agent-guide/registry/networks.yaml                     (p3)
  docs/agent-guide/maps/networks-map.md                       (p3, generiert)
  openspec/changes/devmesh-k3d-decommission/specs/local-dev-mesh.md (p4)
  taskfiles/Taskfile.devmesh.yml                              (p5)
  environments/dev.yaml                                       (p5)
  tests/spec/sdlc-isolation/e2-local-stack.bats               (p6)
  tests/spec/sdlc-isolation/sdlc-up-command.bats              (p6)
  tests/spec/sdlc-isolation/llm-up-health.bats                (p6)
  tests/spec/sdlc-isolation/e3-tickets-lokal.bats             (p6)
  tests/spec/sdlc-isolation/e3-backup.bats                    (p6)
  tests/spec/sdlc-isolation/e3-poller.bats                    (p6)
  tests/spec/db-guard/kubeconfig-drift-guard.bats             (p6)
  tests/spec/db-guard/db-identity-guard.bats                  (p6)
  tests/lib/factory-test-fixtures.sh                          (p6)
  tests/spec/software-factory/_sf_common.bash                 (p6)
  tests/spec/software-factory/merged-dispatch-gate.bats       (p6)
  tests/spec/software-factory/queue-test-data-filter.bats     (p6)
  tests/spec/software-factory/orphan-slot-reap.bats           (p6)
  tests/spec/software-factory/factory-status-lane-status-field.bats (p6)
  tests/spec/software-factory/retry-limit.bats                (p6)
  tests/spec/software-factory/conflict-db-triage.bats         (p6)
  tests/spec/factory-watchdog/merged-ticket-close.bats        (p6)
  tests/spec/ticket-mcp/phase-events-at-column.bats           (p6)
  tests/spec/ticket-mcp/triage-projection.bats                (p6)
  tests/spec/ticket-system/list-test-data-filter.bats         (p6)
  tests/spec/ticket-system/list-status-comma-list.bats        (p6)
  tests/spec/ticket-system/backfill-id-sequence.bats          (p6)
  tests/spec/ticket-system/areas-csv-trim.bats                (p6)
  tests/spec/e2e-test-infrastructure/purge-test-data-missing-table.bats (p6)
  tests/spec/local-llm-proxy.bats                             (p6)
  tests/spec/openspec-pgvector/context-retrieve-cli.bats      (p6)
  tests/spec/openspec-pgvector/context-retrieve-recall.bats   (p6)
  tests/spec/openspec-pgvector/context-retrieve-fallback.bats (p6)
  tests/spec/openspec-embedding/dynamic-port-T003077.bats     (p6)
  tests/spec/local-llm-proxy/host-listener-auth.bats          (p6)
  tests/spec/software-factory/wsl-exit-nachzug.bats           (p6)
  components/website/src/data/test-inventory.json             (p6, generiert)
DELETED:
  scripts/lib/kubelet-cert-hint.sh                            (p2)
  scripts/sdlc/kubelet-cert-check.sh                          (p2)
  k3d/sdlc-stack/k3d-config.yaml                              (p2)
  taskfiles/Taskfile.devcluster.yml                           (p2)
  tests/spec/sdlc-isolation/kubelet-cert-guard.bats           (p6)
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-context-defaults.md | impl | scripts/factory/lib.sh, scripts/factory/conflict-check.sh, scripts/factory/sandbox-run.sh, scripts/factory/wakeup.sh, scripts/ticket.sh, scripts/vda/ticket/_ctx-guard.sh, scripts/runtime-drift-check.sh, scripts/lib/llm-stack-measure.sh, scripts/lib/promote-phases.sh, scripts/session-hub.sh, scripts/finetune/eval-runner.sh, scripts/finetune/model-registry.sh, scripts/finetune/stat-collector.sh, scripts/knowledge/kalibrierung-retrieval.mjs, scripts/mcp-gateway/k3d-postgres-forward.service, scripts/mcp-gateway/watchdog-check.sh, .github/workflows/arbitration.yml, compose.dev.yaml, components/website/src/lib/tickets/final-grilling.ts, environments/.secrets/.ssh/config | p6 |
| p2 | tasks.d/p2-sdlc-tooling.md | impl | taskfiles/Taskfile.sdlc.yml, scripts/sdlc/health-gate.sh, scripts/vda/ticket/_ticket-core.sh, scripts/lib/kubelet-cert-hint.sh, scripts/sdlc/kubelet-cert-check.sh, k3d/sdlc-stack/k3d-config.yaml, taskfiles/Taskfile.devcluster.yml, Taskfile.yml, taskfiles/Taskfile.dev-stack.yml, taskfiles/Taskfile.brainstorm.yml, taskfiles/Taskfile.llm.yml, taskfiles/Taskfile.staging.yml, scripts/sdlc/migrate-tickets.sh, scripts/sdlc/backup-tickets.sh, scripts/sdlc-auth-mode.sh, scripts/sdlc-sync-oidc-secret.sh | p6 |
| p3 | tasks.d/p3-docs.md | impl | CLAUDE.md, .claude/agents/bachelorprojekt-ops.md, docs/superpowers/references/gotchas-footguns.md, docs/sdlc-stack/README.md, docs/sdlc-stack/e3-cutover.md, docs/sdlc-stack/prod-auth.md, docs/bereitstellungsdetails.md, docs/fleet-2026-05-31-what-changed.md, scripts/dev-host-units/README.md, docs/superpowers/specs/2026-05-30-dev-mcp-public-route-design.md, docs/superpowers/specs/2026-06-11-staging-on-demand-design.md, docs/superpowers/specs/2026-07-01-t001341-traefik-hostport-clientip-design.md, docs/agent-guide/registry/networks.yaml, docs/agent-guide/maps/networks-map.md | p6 |
| p4 | tasks.d/p4-spec-deltas.md | impl | openspec/changes/devmesh-k3d-decommission/specs/local-dev-mesh.md, openspec/changes/devmesh-k3d-decommission/specs/batch-factory-pipeline-robustness.md, openspec/changes/devmesh-k3d-decommission/specs/ticket-system.md, openspec/changes/devmesh-k3d-decommission/specs/sdlc-cockpit.md | p6 |
| p5 | tasks.d/p5-acceptance-live.md | impl | scripts/devmesh/acceptance.sh, scripts/devmesh/k3d-teardown.sh, taskfiles/Taskfile.devmesh.yml, environments/dev.yaml | p1, p2, p3, p4 |
| p6 | tasks.d/p6-tests.md | tests | tests/spec/local-dev-mesh/no-k3d-context.bats, tests/spec/local-dev-mesh/factory-ctx-default.bats, tests/spec/local-dev-mesh/k3d-acceptance-gate.bats, tests/spec/sdlc-isolation/kubelet-cert-guard.bats, tests/spec/sdlc-isolation/e2-local-stack.bats, tests/spec/sdlc-isolation/sdlc-up-command.bats, tests/spec/sdlc-isolation/llm-up-health.bats, tests/spec/sdlc-isolation/e3-tickets-lokal.bats, tests/spec/sdlc-isolation/e3-backup.bats, tests/spec/sdlc-isolation/e3-poller.bats, tests/spec/db-guard/kubeconfig-drift-guard.bats, tests/spec/db-guard/db-identity-guard.bats, tests/lib/factory-test-fixtures.sh, tests/spec/software-factory/_sf_common.bash, tests/spec/software-factory/merged-dispatch-gate.bats, tests/spec/software-factory/queue-test-data-filter.bats, tests/spec/software-factory/orphan-slot-reap.bats, tests/spec/software-factory/factory-status-lane-status-field.bats, tests/spec/software-factory/retry-limit.bats, tests/spec/software-factory/conflict-db-triage.bats, tests/spec/factory-watchdog/merged-ticket-close.bats, tests/spec/ticket-mcp/phase-events-at-column.bats, tests/spec/ticket-mcp/triage-projection.bats, tests/spec/ticket-system/list-test-data-filter.bats, tests/spec/ticket-system/list-status-comma-list.bats, tests/spec/ticket-system/backfill-id-sequence.bats, tests/spec/ticket-system/areas-csv-trim.bats, tests/spec/e2e-test-infrastructure/purge-test-data-missing-table.bats, tests/spec/local-llm-proxy.bats, tests/spec/openspec-pgvector/context-retrieve-cli.bats, tests/spec/openspec-pgvector/context-retrieve-recall.bats, tests/spec/openspec-pgvector/context-retrieve-fallback.bats, tests/spec/openspec-embedding/dynamic-port-T003077.bats, tests/spec/local-llm-proxy/host-listener-auth.bats, tests/spec/software-factory/wsl-exit-nachzug.bats, components/website/src/data/test-inventory.json | |

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Run the three new BATS test suites covering the k3d decommission requirements. The tests must FAIL on the current branch.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/no-k3d-context.bats tests/spec/local-dev-mesh/factory-ctx-default.bats tests/spec/local-dev-mesh/k3d-acceptance-gate.bats
# expected: FAIL (red — context defaults and acceptance scripts not yet implemented)
```

- [ ] **Fix-Schritte (GREEN).** Die Partials p1–p5 implementieren die Änderungen; die Tests aus p6 müssen danach grün sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/no-k3d-context.bats tests/spec/local-dev-mesh/factory-ctx-default.bats tests/spec/local-dev-mesh/k3d-acceptance-gate.bats
tests/unit/lib/bats-core/bin/bats -r tests/spec/sdlc-isolation/ tests/spec/db-guard/
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/wsl-exit-nachzug.bats tests/spec/mcp-gateway/watchdog-tunnel-liveness.bats tests/spec/network-address-plan/networks-registry.bats
# expected: PASS
```

- [ ] **Final Verification.** Die drei Pflicht-CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

