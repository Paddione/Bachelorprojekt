---
ticket_id: T900191
plan_ref: openspec/changes/devmesh-llm-services/tasks.md
status: active
date: 2026-09-16
---

# Design: devmesh-llm-services

_Ticket: T900191_

## Goals

- llm-proxy, bge-mcp und mcp-postgres laufen ausschließlich in devmesh.
- Der Dev-Rechner trägt nur VRAM-Dienste (Windows-Seite) und `kubectl port-forward`-Clients.
- Clients erreichen die Dienste unverändert über `127.0.0.1:18235`, `:13001`, `:13005`.

## Non-Goals

- Umzug weiterer dev-pod-Server oder der Ticket-DB.
- GitOps für devmesh.

## Decisions

- **D1 — devmesh ersetzt fleet für diese drei Dienste.** Der fleet-`dev-pod` startet llm-proxy
  und mcp-postgres nicht mehr. Begründung: ein Ort statt drei; nur devmesh erreicht die
  Windows-GPU. Trade-off: fleet-Konsumenten des Proxys (`sdlc-console`, Factory auf fleet)
  verlieren den In-Cluster-Proxy. Sie nutzen ihn heute nur für Remote-Backends; der Plan prüft
  jede Referenz auf `dev-pod:18235` und stellt sie um oder dokumentiert den Wegfall.
- **D2 — GPU-Pfad über `llm-gateway-host`.** Der selector-lose Service bekommt je
  Windows-GPU-Dienst einen benannten Port; die EndpointSlice zeigt auf die Tailnet-Adresse von
  PK-Desktop (`gpu_endpoint.address` in `devmesh/inventory.yaml`). Die Portliste steht in
  `gpu_endpoint.ports` im Inventory, `scripts/devmesh/render-stack.sh` rendert sie. Die
  Tailnet-Policy bekommt je Port eine Ausnahme `tag:devmesh → gpu-host:<port>`.
- **D3 — Registry in der devmesh-`shared-db`.** Eine Migration unter
  `scripts/migrations/` legt `tickets.llm_proxy_backends` an (Schema identisch zu fleet) und
  befüllt sie mit devmesh-URLs. Keine `127.0.0.1`-URL. Der Proxy liest sie über
  `FACTORY_PG_URL` gegen `shared-db.workspace.svc.cluster.local`.
- **D4 — Eigenes Deployment statt dev-pod-Kopie.** `dev-local/components/llm-services` nutzt
  das `mcp-node`-Image mit Env-Schaltern im Supervisor (`MCP_NODE_SERVICES`), damit nur die drei
  Dienste starten. bge-mcp kommt als neuer Supervisor-Eintrag dazu (Port 3007 im Pod,
  Service-Port 13005), mit `LLM_EMBED_URL`/`LLM_RERANKER_URL` auf den Pod-lokalen Proxy.
  Ohne gesetzten Schalter startet der Supervisor wie bisher alles (fleet bleibt kompatibel),
  der fleet-dev-pod setzt den Schalter ohne llm-proxy und postgres.
- **D5 — Tokens fail-closed.** `BGE_MCP_TOKEN`, `MCP_POSTGRES_TOKEN`, `LLM_PROXY_ADMIN_TOKEN`
  kommen aus `environments/sealed-secrets/dev.yaml` (Schema-Eintrag in
  `environments/schema.yaml`). Fehlt ein Wert, startet der Supervisor den Dienst nicht.
- **D6 — Clients.** `scripts/mcp-gateway/mcp-gateway.service` forwardet `svc/llm-services`
  aus `--context devmesh` (18235, 13001, 13005) zusätzlich zu 18080 aus fleet
  (zwei ExecStart-Prozesse über zwei Units). `start-windows.ps1` bekommt dieselbe Aufteilung
  und startet den bge-mcp-Shim nicht mehr lokal.
- **D7 — Rückbau WSL-Units.** Die Unit-Dateien werden gelöscht; die Guards, die sie voraussetzen
  (`wsl-exit-nachzug.bats`, `local-llm-proxy.bats`, `proxy-env-token-guard.bats`,
  `bge-host-routing.bats`, `gateway-consumer-lint.bats`, `bge-usecase-reachability.bats`,
  `watchdog-tunnel-liveness.bats`) werden auf die Manifeste umgestellt.

## Datenfluss

```
Client 127.0.0.1:{18235,13001,13005}
  └─ kubectl --context devmesh port-forward svc/llm-services
       └─ Pod llm-services (mcp-node)
            ├─ llm-proxy :18235 ─┬─ llm-gateway-host:<port> ─ Tailnet ─ PK-Desktop (Windows-GPU)
            │                    ├─ bge-embed / bge-rerank (Cluster-DNS)
            │                    └─ Remote (DeepSeek, opencode-zen)
            ├─ mcp-postgres :3001 ─ shared-db.workspace (mcp_readonly)
            └─ bge-mcp :3007 ─ llm-proxy :18235
```

## Fehlerverhalten

- PK-Desktop aus: GPU-Routen antworten `no_backend`/502, der Pod bleibt Running
  (bestehendes `gpu-endpoint`-Verhalten).
- Registry leer oder DB nicht erreichbar: bestehender Poll-Fallback des Proxys (letzter Stand).
- Token fehlt: Dienst startet nicht, Supervisor loggt den Grund.

## Tests

- `tests/spec/local-dev-mesh/llm-services.bats`: gerenderter Stack enthält das Deployment, den
  Service mit drei Ports, `llm-gateway-host` mit allen GPU-Ports; Migration enthält keine
  `127.0.0.1`.
- `tests/spec/mcp-gateway/start-windows-unc.bats`: beide PS1-Skripte nutzen `.ProviderPath`
  (T900190).
- Umgestellte Guards aus D7.

## Risiken

- R1: Tailnet-ACL-Änderung ist ein manueller Schritt außerhalb des Repos (Runbook).
- R2: devmesh-Kernstack fehlt heute; ohne ihn ist der Umzug nicht verifizierbar.
- R3: `gpu-cluster-3` ist NotReady; Scheduling nur auf Ready-Knoten.
