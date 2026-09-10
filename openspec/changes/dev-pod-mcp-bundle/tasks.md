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
| `k3d/default/claude-code-mcp-monolith-deploy.yaml` | entfaellt |
| `tests/spec/mcp-gateway.bats` | Monolith-Guard auf den dev-Pod umhaengen |
| `tests/spec/dev-pod-mcp-bundle/dev-pod.bats` | neue Guards |

## Aufgaben

### 1. Failing test zuerst

- [ ] `tests/spec/dev-pod-mcp-bundle/dev-pod.bats` anlegen: prueft, dass das Deployment
      genau drei Container fuehrt, dass ausser `repo-sync` kein Container das Checkout-Volume
      beschreibbar mountet, und dass kein Ingress/IngressRoute auf die MCP-Pfade zeigt.
      Ausfuehren mit `tests/unit/lib/bats-core/bin/bats tests/spec/dev-pod-mcp-bundle/dev-pod.bats`
      — expected: FAIL (die Manifeste existieren noch nicht).

### 2. Images

- [ ] `docker/mcp-node/Dockerfile`: Node-Runtime, die sieben Server, ein Supervisor. Kein
      Paketmanager zur Laufzeit — alle Binaries (`psql`, `curl`, `git`) im Image.
- [ ] `docker/repo-sync/Dockerfile`: git + Loop-Script fuer `fetch && reset --hard origin/main`.
- [ ] Build-Workflows analog zu den bestehenden `build-*.yml`.

### 3. Manifeste

- [ ] PVC, Deployment, Service unter `k3d/dev-pod/`. Requests an den gemessenen Werten
      orientieren (Monolith real 341Mi gegen 960Mi deklariert), nicht an den Altwerten.
- [ ] Overlay `prod-fleet/dev-pod/` und `flux/clusters/fleet/ks-dev-pod.yaml`.
- [ ] Kein Ingress, keine IngressRoute, kein LoadBalancer fuer die MCP-Ports.

### 4. llm-proxy entschlacken

- [ ] `scripts/llm-proxy/backends.mjs`: Loadout-Verwaltung (systemd-User-Units) und
      `exclusiveGroup`-Arbitrierung entfernen, Backend-Aufloesung auf Remote-Backends reduzieren.
- [ ] `scripts/llm-proxy/listeners.mjs`: Bind-Pfad auf den Cluster-Betrieb reduzieren.
- [ ] Klaeren, ob der Bind-Pfad aus PR #5524 im neuen Image noch existiert; Ticket T900106
      entsprechend schliessen oder den PR uebernehmen.

### 5. Monolith abloesen

- [ ] Clients auf die Mesh-Adressen des dev-Pod umstellen (`docs/agent-guide/registry/mcp.yaml`,
      danach `task mcp:sync`).
- [ ] Port-Forward-Watchdog abbauen, sofern er ohne Tunnel gegenstandslos wird.
- [ ] `k3d/default/claude-code-mcp-monolith-deploy.yaml` entfernen — im selben Commit wie die
      Spec-Aenderung, sonst schlaegt der Guard in `tests/spec/mcp-gateway.bats` an.
- [ ] Denselben Guard auf den dev-Pod umhaengen, damit er nach dem Wegfall des Manifests nicht
      still uebersprungen wird.

### 6. Verifikation

- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check`
- [ ] `task openspec:validate`
