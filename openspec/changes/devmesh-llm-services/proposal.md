# Proposal: devmesh-llm-services

## Why

Die CPU/RAM-Dienste llm-proxy (:18235), bge-mcp (:13005) und mcp-postgres (:13001) laufen
heute an zwei Orten: als WSL-systemd-user-Units auf dem Dev-Rechner und als Container des
fleet-`dev-pod` (`workspace-dev`). Der Dev-Rechner soll nur noch VRAM-Dienste tragen
(llama.cpp, LM Studio, FreeToken auf der Windows-Seite). Der fleet-Pod erreicht diese
GPU-Dienste nicht, weil die Backend-Registry `127.0.0.1`-URLs führt und fleet keinen Pfad zum
Dev-Rechner hat. devmesh hat diesen Pfad bereits: `llm-gateway-host` zeigt über das Tailnet auf
PK-Desktop (ADR-008 SP-1).

Zusätzlich scheitert der Windows-Startmechanismus `scripts/mcp-gateway/start-windows.ps1`, wenn
er aus `\\wsl.localhost\...` aufgerufen wird (Bug T900190): `Resolve-Path(...).Path` liefert den
Provider-Präfix `Microsoft.PowerShell.Core\FileSystem::`, node bricht mit `MODULE_NOT_FOUND` ab.

## What

- Neue devmesh-Komponente `dev-local/components/llm-services`: ein Deployment mit dem
  `mcp-node`-Image, dessen Supervisor nur llm-proxy, mcp-postgres und bge-mcp startet.
- `dev-local/core/gpu-endpoint.yaml` bekommt einen benannten Port je Windows-GPU-Dienst.
- Migration legt `tickets.llm_proxy_backends` in der devmesh-`shared-db` an, mit devmesh-URLs
  (Cluster-DNS für bge, `llm-gateway-host:<port>` für die Windows-GPU).
- Clients (`mcp-gateway.service`, `start-windows.ps1`) forwarden 18235/13001/13005 aus devmesh.
- fleet-`dev-pod` startet llm-proxy und mcp-postgres nicht mehr.
- WSL-Units `llm-proxy`, `llm-proxy-lan`, `bge-mcp`, `bge-forward-*`, `mcp-postgres-local`,
  `k3d-postgres-forward` entfallen.
- ADR-008-Nachtrag, Tailnet-Runbook (ACL je GPU-Port), `docs/agent-guide/registry/mcp.yaml`.
- Fix T900190: `.ProviderPath` statt `.Path` in `start-windows.ps1` und `register-autostart.ps1`.

## Non-Goals

- Die übrigen dev-pod-Server (ticket, brain, task-runner, github, codebase-memory,
  mcp-kubernetes) bleiben auf fleet. Die Ticket-DB bleibt fleet-führend.
- Keine Änderung an den VRAM-Diensten auf Windows.
- Kein Flux für devmesh; Auslieferung weiter über `task devmesh:deploy`.
- Die fleet-Registry-Tabelle bleibt unverändert.

## Voraussetzung

Der devmesh-Kernstack (`task devmesh:deploy PROFILE=core`) ist deployt. Stand 2026-09-16 hat
devmesh keinen `workspace`-Namespace.

_Ticket: T900191 (enthält Fix T900190)_
