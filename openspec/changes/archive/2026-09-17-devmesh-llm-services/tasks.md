---
title: "devmesh-llm-services — Implementation Plan"
ticket_id: T900191
domains: [infra, ops, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# devmesh-llm-services — Implementation Plan

## File Structure

```
devmesh/inventory.yaml                                   (aend) P1a — gpu_endpoint.address + gpu_endpoint.ports
devmesh/tailnet-policy.hujson                            (aend) P1a — Ausnahme je GPU-Port
dev-local/core/gpu-endpoint.yaml                         (aend) P1a — ein benannter Port je GPU-Dienst
dev-local/core/kustomization.yaml                        (aend) P1b — Komponente llm-services einhaengen
dev-local/components/llm-services/kustomization.yaml     (neu)  P1b
dev-local/components/llm-services/deployment.yaml        (neu)  P1b — mcp-node, MCP_NODE_SERVICES
dev-local/components/llm-services/service.yaml           (neu)  P1b — 18235 / 13001 / 13005
scripts/devmesh/render-stack.sh                          (aend) P1a — Portliste rendern
environments/schema.yaml                                 (aend) P1b — neue dev-Secret-Keys
scripts/migrations/2026-09-16-devmesh-llm-proxy-backends.sql (neu) P1b — Registry ohne Loopback
taskfiles/Taskfile.devmesh.yml                           (aend) P1b — devmesh:registry:migrate
docker/mcp-node/supervisor.sh                            (aend) P2  — Dienstauswahl, bge-mcp
docker/mcp-node/Dockerfile                               (aend) P2  — pg fuer mcp-postgres-local
k3d/dev-pod/deployment.yaml                              (aend) P2  — fleet ohne llm-proxy/postgres
k3d/dev-pod/service.yaml                                 (aend) P2
scripts/openspec-embed-local.sh                          (aend) P2  — Remediation-Text
scripts/mcp-gateway/start-windows.ps1                    (aend) P3a — T900190 + devmesh-Forward
scripts/mcp-gateway/register-autostart.ps1               (aend) P3a — T900190
scripts/mcp-gateway/mcp-gateway.service                  (aend) P3b — nur fleet 18080/13002
scripts/mcp-gateway/devmesh-forward.service              (neu)  P3b
scripts/mcp-gateway/mcp-gateway-watchdog.service         (aend) P3b
scripts/mcp-gateway/mcp-gateway-watchdog.timer           (aend) P3b
scripts/mcp-gateway/watchdog-check.sh                    (aend) P3b
scripts/mcp-gateway/probe.sh                             (aend) P3b
scripts/mcp-gateway/start-mcp-unified.sh                 (aend) P3b
scripts/bge-mcp/check-client-env.sh                      (aend) P3b
scripts/llm/start-gemma-server.ps1                       (aend) P3a
scripts/dev-host-units/install.sh                        (aend) P3b
scripts/dev-host-units/uninstall.sh                      (aend) P3b
scripts/dev-host-units/README.md                         (aend) P3b
Taskfile.yml                                             (aend) P3b
taskfiles/Taskfile.agents.yml                            (aend) P3b — zwei Forwards
taskfiles/Taskfile.llm.yml                               (aend) P3b — install-service-Tasks raus
scripts/bge-mcp/bge-mcp.service                          (loe)  P3b
scripts/bge-mcp/bge-forward-embed.service                (loe)  P3b
scripts/bge-mcp/bge-forward-rerank.service               (loe)  P3b
scripts/llm-proxy/llm-proxy.service                      (loe)  P3b
scripts/llm-proxy/llm-proxy-lan.service                  (loe)  P3b
scripts/mcp-gateway/mcp-postgres-local.service           (loe)  P3b
scripts/mcp-gateway/k3d-postgres-forward.service         (loe)  P3b
docs/adr/ADR-008-local-k3s-dev-mesh.md                   (aend) P4  — Nachtrag T900191
docs/adr/ADR-007-wsl-exit-fleet-native.md                (aend) P4  — Verweis
docs/runbooks/devmesh-tailnet.md                         (aend) P4  — ACL + Umzugsschritte
docs/agent-guide/registry/mcp.yaml                       (aend) P4
.mcp.json                                                (gen)  P4  — task mcp:sync
.opencode/opencode.jsonc                                 (gen)  P4
scripts/llm/mcp-servers.json                             (gen)  P4
CLAUDE.md                                                (aend) P4
.claude/skills/references/mcp-tool-guide.md              (aend) P4
tests/spec/local-dev-mesh/llm-services.bats              (neu)  P5a
tests/spec/local-dev-mesh/tailnet-policy.bats            (aend) P5a
tests/spec/mcp-gateway/start-windows-unc.bats            (neu)  P5a
tests/spec/dev-pod-mcp-bundle/dev-pod.bats               (aend) P5a
tests/spec/software-factory/wsl-exit-nachzug.bats        (aend) P5b
tests/spec/local-llm-proxy.bats                          (aend) P5b
tests/spec/local-llm-proxy/proxy-env-token-guard.bats    (aend) P5b
tests/spec/mcp-gateway/bge-host-routing.bats             (aend) P5b
tests/spec/local-llm-proxy/gateway-consumer-lint.bats    (aend) P5b
tests/spec/llm-pipeline/bge-usecase-reachability.bats    (aend) P5b
tests/spec/mcp-gateway/watchdog-tunnel-liveness.bats     (aend) P5b
tests/spec/local-llm-proxy/bge-role-routes.bats          (aend) P5b
components/website/src/data/test-inventory.json          (gen)  P5b
```

_Ticket: T900191 (enthält Fix T900190)_

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1a-gpu-endpoint | tasks.d/p1a-gpu-endpoint.md | impl | devmesh/inventory.yaml, devmesh/tailnet-policy.hujson, dev-local/core/gpu-endpoint.yaml, scripts/devmesh/render-stack.sh |  |
| p1b-llm-services | tasks.d/p1b-llm-services.md | impl | dev-local/components/llm-services/kustomization.yaml, dev-local/components/llm-services/deployment.yaml, dev-local/components/llm-services/service.yaml, dev-local/core/kustomization.yaml, environments/schema.yaml, scripts/migrations/2026-09-16-devmesh-llm-proxy-backends.sql, taskfiles/Taskfile.devmesh.yml | p1a-gpu-endpoint |
| p2-supervisor-fleet | tasks.d/p2-supervisor-fleet.md | impl | docker/mcp-node/supervisor.sh, docker/mcp-node/Dockerfile, k3d/dev-pod/deployment.yaml, k3d/dev-pod/service.yaml, scripts/openspec-embed-local.sh |  |
| p3a-windows | tasks.d/p3a-windows.md | impl | scripts/mcp-gateway/start-windows.ps1, scripts/mcp-gateway/register-autostart.ps1, scripts/llm/start-gemma-server.ps1 | p2-supervisor-fleet |
| p3b-wsl-units | tasks.d/p3b-wsl-units.md | impl | scripts/mcp-gateway/mcp-gateway.service, scripts/mcp-gateway/devmesh-forward.service, scripts/mcp-gateway/mcp-gateway-watchdog.service, scripts/mcp-gateway/mcp-gateway-watchdog.timer, scripts/mcp-gateway/watchdog-check.sh, scripts/mcp-gateway/probe.sh, scripts/mcp-gateway/start-mcp-unified.sh, scripts/bge-mcp/check-client-env.sh, scripts/dev-host-units/install.sh, scripts/dev-host-units/uninstall.sh, scripts/dev-host-units/README.md, Taskfile.yml, taskfiles/Taskfile.agents.yml, taskfiles/Taskfile.llm.yml, scripts/bge-mcp/bge-mcp.service, scripts/bge-mcp/bge-forward-embed.service, scripts/bge-mcp/bge-forward-rerank.service, scripts/llm-proxy/llm-proxy.service, scripts/llm-proxy/llm-proxy-lan.service, scripts/mcp-gateway/mcp-postgres-local.service, scripts/mcp-gateway/k3d-postgres-forward.service | p2-supervisor-fleet |
| p4-docs-registry | tasks.d/p4-docs-registry.md | impl | docs/adr/ADR-008-local-k3s-dev-mesh.md, docs/adr/ADR-007-wsl-exit-fleet-native.md, docs/runbooks/devmesh-tailnet.md, docs/agent-guide/registry/mcp.yaml, .mcp.json, .opencode/opencode.jsonc, scripts/llm/mcp-servers.json, CLAUDE.md, .claude/skills/references/mcp-tool-guide.md | p1b-llm-services, p3b-wsl-units |
| p5a-new-guards | tasks.d/p5a-new-guards.md | tests | tests/spec/local-dev-mesh/llm-services.bats, tests/spec/local-dev-mesh/tailnet-policy.bats, tests/spec/mcp-gateway/start-windows-unc.bats, tests/spec/dev-pod-mcp-bundle/dev-pod.bats | p1a-gpu-endpoint, p1b-llm-services, p2-supervisor-fleet, p3a-windows, p3b-wsl-units, p4-docs-registry |
| p5b-guard-migration | tasks.d/p5b-guard-migration.md | tests | tests/spec/software-factory/wsl-exit-nachzug.bats, tests/spec/local-llm-proxy.bats, tests/spec/local-llm-proxy/proxy-env-token-guard.bats, tests/spec/mcp-gateway/bge-host-routing.bats, tests/spec/local-llm-proxy/gateway-consumer-lint.bats, tests/spec/llm-pipeline/bge-usecase-reachability.bats, tests/spec/mcp-gateway/watchdog-tunnel-liveness.bats, tests/spec/local-llm-proxy/bge-role-routes.bats, components/website/src/data/test-inventory.json | p5a-new-guards |

Die target_files-Mengen sind disjunkt. P2, P3a und P3b muessen im selben Merge landen: nach P2 bietet
`svc/dev-pod` die Ports 18235 und 3001 nicht mehr an, und ein Forward mit diesen Ports scheitert
komplett (auch 18080).

## Kontext

Entscheidungen und Begruendung: `design.md` (D1 devmesh ersetzt fleet fuer llm-proxy, bge-mcp und
mcp-postgres; D2 GPU-Pfad ueber `llm-gateway-host`; D3 Registry in der devmesh-`shared-db`;
D4 eigenes Deployment; D5 Tokens fail-closed; D6 Clients; D7 Rueckbau WSL-Units).

Voraussetzungen ausserhalb des Repos, als manuelle Operator-Schritte in P1b, P3a, P3b und P4 beschrieben:
devmesh-Kernstack deployt, Tailnet-ACL eingespielt, dev-Secrets gesiegelt, fleet-Deployment
`llm-proxy` in `workspace-dev` nach ausdruecklicher Freigabe entfernt (P2.6).

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Steht in `tasks.d/p5a-new-guards.md` (Task P5a.1). Die neuen Guards
      schlagen vor P1a–P4 fehl — expected: FAIL.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/llm-services.bats tests/spec/mcp-gateway/start-windows-unc.bats
# expected: FAIL (red — P1a–P4 noch nicht umgesetzt)
```

- [ ] **Umsetzung (GREEN).** P1a bis P4 in der Reihenfolge der depends_on-Spalte, danach P5a und P5b.

- [ ] **Final Verification.** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
