---
title: dev-Pod buendelt MCP-Server und llm-proxy
ticket_id: T900107
domains: [infra, mcp, llm]
status: planning
---

# dev-Pod buendelt MCP-Server und llm-proxy — Implementation Plan

## File Structure

| Pfad | Rolle |
|---|---|
| `k3d/dev-pod/deployment.yaml` | Deployment mit drei Containern, Requests/Limits pro Container |
| `k3d/dev-pod/pvc.yaml` | PVC `dev-pod-repo` fuer den Checkout |
| `k3d/dev-pod/service.yaml` | ClusterIP-Service, MCP-Ports, ohne Ingress |
| `k3d/dev-pod/kustomization.yaml` | Kustomize-Basis |
| `prod-fleet/dev-pod/kustomization.yaml` | Overlay, von Flux referenziert |
| `flux/clusters/fleet/ks-dev-pod.yaml` | Flux-Kustomization |
| `docker/mcp-node/Dockerfile` | Image mit Node-Servern + Supervisor, ohne Runtime-Paketinstallation |
| `docker/repo-sync/Dockerfile` | Sync-Sidecar-Image |
| `scripts/llm-proxy/backends.mjs` | Loadout-/llama.cpp-Zweig entfernen |
| `scripts/llm-proxy/listeners.mjs` | Bind-Pfad auf den Cluster-Betrieb reduzieren |
| `docs/agent-guide/registry/mcp.yaml` | `cluster`-Sektion auf den dev-Pod umschreiben |
| `scripts/openspec-embed-local.sh` | Embed-Endpunkt vom lokalen `:18235` auf den dev-Pod umstellen |
| `k3d/default/claude-code-mcp-monolith-deploy.yaml` | entfaellt |
| `tests/spec/mcp-gateway.bats` | Monolith-Guard auf den dev-Pod umhaengen |
| `tests/spec/dev-pod-mcp-bundle/dev-pod.bats` | neue Guards |

## Aufgaben

### 1. Failing test zuerst

- [x] `tests/spec/dev-pod-mcp-bundle/dev-pod.bats` anlegen: prueft, dass das Deployment
      genau drei Container fuehrt, dass ausser `repo-sync` kein Container das Checkout-Volume
      beschreibbar mountet, und dass kein Ingress/IngressRoute auf die MCP-Pfade zeigt.
      Ausfuehren mit `tests/unit/lib/bats-core/bin/bats tests/spec/dev-pod-mcp-bundle/dev-pod.bats`
      — expected: FAIL (die Manifeste existieren noch nicht).

### 2. Images

- [x] `docker/mcp-node/Dockerfile`: Node-Runtime, die sieben Server, ein Supervisor. Kein
      Paketmanager zur Laufzeit — alle Binaries (`psql`, `curl`, `git`) im Image.
- [x] `docker/repo-sync/Dockerfile`: git + Loop-Script fuer `fetch && reset --hard origin/main`.
- [x] Build-Workflows analog zu den bestehenden `build-*.yml`.

### 3. Manifeste

- [x] PVC, Deployment, Service unter `k3d/dev-pod/`. Requests an den gemessenen Werten
      orientieren (Monolith real 341Mi gegen 960Mi deklariert), nicht an den Altwerten.
- [x] Overlay `prod-fleet/dev-pod/` und `flux/clusters/fleet/ks-dev-pod.yaml`.
- [x] Kein Ingress, keine IngressRoute, kein LoadBalancer fuer die MCP-Ports.

### 4. llm-proxy entschlacken

- [x] `scripts/llm-proxy/backends.mjs`: Loadout-Verwaltung (systemd-User-Units) und
      `exclusiveGroup`-Arbitrierung entfernen, Backend-Aufloesung auf Remote-Backends reduzieren.
- [x] `scripts/llm-proxy/listeners.mjs`: Bind-Pfad auf den Cluster-Betrieb reduzieren.
- [x] Klaeren, ob der Bind-Pfad aus PR #5524 im neuen Image noch existiert; Ticket T900106
      entsprechend schliessen oder den PR uebernehmen.
- [x] Konsumenten von `127.0.0.1:18235` erheben und umstellen — `grep -rl '18235' scripts/`
      liefert 46 Dateien. `scripts/openspec-embed-local.sh` ist dabei der kritische Fall: der
      post-commit-Hook fuer OpenSpec-Embeddings ruft diesen Port und schlug beim Stagen dieses
      Changes fehl, weil der Proxy nicht lief. Solange der Proxy lokal erwartet wird, bricht der
      Hook auf jeder Maschine ohne laufenden Proxy — der Umzug in den Cluster behebt das nur,
      wenn die Adresse mitwandert.

### 5. Monolith abloesen

- [x] Clients auf die Mesh-Adressen des dev-Pod umstellen (`docs/agent-guide/registry/mcp.yaml`,
      danach `task mcp:sync`).
- [x] Port-Forward-Watchdog abbauen, sofern er ohne Tunnel gegenstandslos wird.
      **Befund: er wird es nicht — er bleibt, nur auf `svc/dev-pod` umgehaengt.**
      Das Service-Netz `10.43.0.0/16` wird nicht ueber das wg-Mesh geroutet, nur das
      Pod-Netz `10.42.0.0/16` (`docs/agent-guide/maps/networks-map.md:30-31`). Eine
      ClusterIP ist vom Arbeitsplatz also weiterhin nur ueber `kubectl port-forward`
      erreichbar; der Tunnel und damit sein Watchdog bleiben noetig.
- [x] `k3d/default/claude-code-mcp-monolith-deploy.yaml` entfernen — im selben Commit wie die
      Spec-Aenderung, sonst schlaegt der Guard in `tests/spec/mcp-gateway.bats` an.
- [x] Denselben Guard auf den dev-Pod umhaengen, damit er nach dem Wegfall des Manifests nicht
      still uebersprungen wird.

### 6. Verifikation

- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check`
- [ ] `task openspec:validate`
