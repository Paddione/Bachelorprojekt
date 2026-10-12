---
title: "p5-tailnet — Tailnet-Resolver und redundante Subnet-Route"
ticket_id: T016515
domains: [infra, scripts]
status: draft
---

# lan-dns-adguard — Implementation Plan

Partial-Plan `p5-tailnet` fuer T016515. Zieldateien exklusiv:
`devmesh/tailnet-policy.hujson`, `devmesh/inventory.yaml`,
`scripts/devmesh/tailnet-subnet-routes.sh`.

## File Structure

| Datei | Ist | Budget |
| `devmesh/tailnet-policy.hujson` | 30 | n/a |
| `devmesh/inventory.yaml` | 79 | n/a |
| `scripts/devmesh/tailnet-subnet-routes.sh` | 0 | 800 |

## Task 1 — Tailnet-Policy (Soll)

1. `tagOwners`: `"tag:lan-dns": ["autogroup:admin", "tag:k8s-operator"]`
   (Operator darf das Proxy-Geraet taggen; Name des Operator-Tags vorher in
   der Live-Policy pruefen und uebernehmen).
2. ACL: `{"action": "accept", "src": ["autogroup:member", "tag:devmesh", "tag:devclient"], "dst": ["tag:lan-dns:53"]}`
   mit Kommentarzeile (Format-Regel der Datei: nur ganze Kommentarzeilen).
3. `autoApprovers`: `{"routes": {"10.0.0.0/24": ["tag:devmesh"]}}`.

## Task 2 — Inventar

`subnet_routes: [10.0.0.0/24]` bei `gpu-cluster` und `gpu-cluster2`; Feld im
Kopfkommentar dokumentieren.

## Task 3 — tailnet-subnet-routes.sh und Task

Liest Peers mit `subnet_routes`, setzt per SSH
`sudo tailscale set --advertise-routes=<liste, komma-getrennt>` (idempotent).
`DRY_RUN=1` gibt nur Host und Befehl aus. Exit 0/1/2 wie `lan-dns-firewall.sh`.
Taskfile-Eintrag `devmesh:tailnet:routes` gehoert zu p2 (Taskfile ist dort
exklusiv) und ruft dieses Skript auf.

Akzeptanzkriterien:

- `DRY_RUN=1 bash scripts/devmesh/tailnet-subnet-routes.sh` listet genau
  gpu-cluster und gpu-cluster2 mit `--advertise-routes=10.0.0.0/24`.
- Bestehende Policy-Guards bleiben gruen.
