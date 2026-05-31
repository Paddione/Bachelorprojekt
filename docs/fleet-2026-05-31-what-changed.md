---
title: "Fleet-Konsolidierung — was sich am 2026-05-31 geändert hat"
domain: infra
---

# Fleet-Konsolidierung (2026-05-31)

Beide Marken laufen jetzt auf **einem** k3s-Cluster (`fleet`): 3 Control-Plane-
Knoten (pk-hetzner-4/6/8) + 3 Worker (gekko-hetzner-2/3/4).

- **Namespaces:** `workspace` (mentolder) und `workspace-korczewski` (korczewski)
  — getrennte Deployments, eigene `shared-db` und sealed-secrets pro Marke.
- **Tote Kontexte:** alle kubeconfig-Kontexte außer `fleet` und `devc` sind tot.
  Die alten `mentolder`- und `korczewski`-Standalone-Cluster sind abgebaut.
- **Fleet-API:** über die öffentliche IP von pk-hetzner-4 (`204.168.244.104:6443`),
  nicht über den alten `127.0.0.1:16443`-Tunnel.
