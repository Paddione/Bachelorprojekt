# Proposal: devmesh-tailnet

## Why

ADR-008 bringt einen lokalen k3s-Dev-Cluster (`devmesh`) auf Bare-Metal im Heimnetz zurück.
Die Dev-Maschinen (PK-Desktop, PK-L-1, PK-Tablet) müssen ihn zu Hause direkt über das LAN
erreichen und unterwegs über einen Fallback-Pfad. `sdlc-isolation` verbietet heute jeden
Remote-Zugang (ADR-006), weil ein eingehender Weg ins Heimnetz entstünde.

Das bestehende Tailnet (`docs/agent-guide/registry/networks.yaml`, Eintrag `tailscale`) löst
beides ohne Port-Forward: Tailscale wählt im LAN den direkten Pfad und fällt sonst auf ein
DERP-Relay zurück. Ein eigenes WireGuard-Full-Mesh bräuchte einen Endpoint-Failover-Agenten,
der auf den Windows-Clients nicht verlässlich automatisierbar ist.

_Ticket: T900116_ · Programm: T900115 (ADR-008) · Nachfolger: T900117 (SP-2)

## What Changes

1. **Peers im Tailnet `p.korczewski`:** `gpu-metal`, `gpu-cluster`, `gpu-cluster2` mit Tag
   `tag:devmesh`; PK-Desktop, PK-L-1 und PK-Tablet mit Tag `tag:devclient`. Tailscale läuft
   auf den drei Clients im Windows-Host; die WSL-Distros sehen das Tailnet über
   `networkingMode = mirrored`. `ws-ubuntu-1` folgt in SP-5 (T900120).
2. **Inventar `devmesh/inventory.yaml`:** eine Zeile pro Peer mit `name`, `role`
   (`server`/`client`), `tag`, `lan_ip`, `tailnet_name`. SP-2 ergänzt die k3s-Felder.
3. **ACL-Policy im Repo `devmesh/tailnet-policy.hujson`:** `tag:devclient` → `tag:devmesh`
   auf tcp 22, 443, 6443; `tag:devmesh` ↔ `tag:devmesh` vollständig; kein Pfad
   `tag:devmesh` → `tag:devclient`. Das Einspielen ist ein dokumentierter Operator-Schritt
   (Admin-Konsole), das Repo hält die Soll-Fassung.
4. **Prüfskript `scripts/devmesh/tailnet-check.sh`:** pingt jeden Inventar-Peer per
   `tailscale ping` und meldet `direct` oder `relay`. Exit `0` alle erreichbar, `1` mindestens
   ein Peer unerreichbar, `2` Vorbedingung fehlt (CLI, Tailscale-Dienst nicht `Running`).
5. **Registry:** der `tailscale`-Eintrag in `networks.yaml` beschreibt die devmesh-Rollen
   statt einzelner Geräte-IPs.
6. **`sdlc-isolation`:** das Requirement „No remote cockpit and no tunnel into the home
   network" wird umbenannt und auf Tailnet-only-Zugriff ohne eingehenden Port umgeschrieben.

## Non-Goals

- Das `wg-gpu`-Mesh (`192.168.100.0/24`, Hetzner ↔ bge/GPU) bleibt unverändert.
- k3s-Node-Traffic läuft nicht über das Tailnet (LAN direkt, SP-2).
- Kein Headscale in diesem Change (Ausbaupfad bei DSGVO-Bedarf), kein Tailscale Funnel für devmesh.
- Keine öffentlichen DNS-Records (SP-3).

## Impact

- Specs: `local-dev-mesh` (neu, ADDED), `sdlc-isolation` (RENAMED)
- Dateien: `devmesh/inventory.yaml`, `devmesh/tailnet-policy.hujson`,
  `scripts/devmesh/tailnet-check.sh`, `docs/agent-guide/registry/networks.yaml`,
  `tests/spec/local-dev-mesh/`
- Operator-Schritte: Tailscale auf PK-Desktop steht auf `NoState` (Messung 2026-09-11) und muss
  laufen; SSH-Zugang zu den Bare-Metal-Hosts für den Beitritt.
