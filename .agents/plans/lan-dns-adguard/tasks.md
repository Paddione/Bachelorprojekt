---
title: "lan-dns-adguard — Implementation Plan"
ticket_id: T016515
domains: [infra, scripts, testing]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# lan-dns-adguard — Implementation Plan

AdGuard Home redundant in devmesh als Upstream-DNS der Fritzbox.
Design und Entscheidungen D1-D4: `design.md`.

_Ticket: T016515_

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `dev-local/lan-dns/kustomization.yaml` | 0 (neu) | n/a (YAML) |
| `dev-local/lan-dns/adguard.yaml` | 0 (neu) | n/a (YAML) |
| `dev-local/lan-dns/AdGuardHome.yaml` | 0 (neu) | n/a (YAML) |
| `taskfiles/Taskfile.devmesh.yml` | 142 | n/a (YAML) |
| `scripts/devmesh/k3s-install.sh` | 156 | 644 |
| `scripts/devmesh/lan-dns-firewall.sh` | 0 (neu) | 800 |
| `docs/runbooks/devmesh-lan-dns.md` | 0 (neu) | n/a (Doku) |
| `devmesh/tailnet-policy.hujson` | 30 | n/a (Policy) |
| `devmesh/inventory.yaml` | 79 | n/a (YAML) |
| `scripts/devmesh/tailnet-subnet-routes.sh` | 0 (neu) | 800 |
| `tests/py/spec/native_ported/spec/local-dev-mesh/test_tailnet_policy.py` | 94 | 706 |
| `tests/py/spec/native_ported/spec/local-dev-mesh/test_lan_dns.py` | 0 (neu) | 800 |

Budget-Quelle: `.sh`/`.py`-Limit 800 aus `docs/code-quality/gates.yaml`;
keine Datei gebaselined.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-manifests.md | impl | `dev-local/lan-dns/kustomization.yaml`, `dev-local/lan-dns/adguard.yaml`, `dev-local/lan-dns/AdGuardHome.yaml` |  |
| p2 | tasks.d/p2-tasks-firewall.md | impl | `taskfiles/Taskfile.devmesh.yml`, `scripts/devmesh/k3s-install.sh`, `scripts/devmesh/lan-dns-firewall.sh` | p1 |
| p3 | tasks.d/p3-runbook.md | impl | `docs/runbooks/devmesh-lan-dns.md` | p2, p5 |
| p5 | tasks.d/p5-tailnet.md | impl | `devmesh/tailnet-policy.hujson`, `devmesh/inventory.yaml`, `scripts/devmesh/tailnet-subnet-routes.sh` |  |
| p4 | tasks.d/p4-tests.md | tests | `tests/py/spec/native_ported/spec/local-dev-mesh/test_lan_dns.py`, `tests/py/spec/native_ported/spec/local-dev-mesh/test_tailnet_policy.py` | p1, p2, p5 |

## Tasks

- [ ] **1. Partial p1** (`tasks.d/p1-manifests.md`): Kustomize-Komponente
  `dev-local/lan-dns/` mit Namespace, ConfigMap, Deployment, PDB, Services.
- [ ] **2. Partial p2** (`tasks.d/p2-tasks-firewall.md`): Tasks
  `devmesh:dns:deploy` und `devmesh:dns:check`, Firewall-Skript, ufw-Regel
  in `k3s-install.sh`.
- [ ] **3. Partial p3** (`tasks.d/p3-runbook.md`): Runbook mit Pruefung,
  Ausfalltest, Fritzbox-Umstellung und Rueckweg.
- [ ] **3b. Partial p5** (`tasks.d/p5-tailnet.md`): Tailnet-Policy
  (`tag:lan-dns`, DNS-Regel, `autoApprovers`), Inventarfeld `subnet_routes`,
  Skript fuer redundante Subnet-Route.
- [ ] **4. Partial p4** (`tasks.d/p4-tests.md`): Render- und Task-Tests.
- [ ] **5. Live-Abnahme** (nach Merge, Operator-Freigabe noetig):
  `task devmesh:dns:deploy`, `task devmesh:dns:check`,
  `task devmesh:tailnet:routes`, Ausfalltest laut Runbook. Fritzbox- und
  Tailscale-Admin-Umstellung macht der Operator.
- [ ] **6. Finaler Verifikations-Task.** In dieser Reihenfolge:
  `task test:changed`, `task freshness:regenerate`, `task freshness:check`.
  Alle drei gruen; Umwelt-Ausschluesse im Ausfuehrungsreport belegen.
