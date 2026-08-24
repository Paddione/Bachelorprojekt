# Proposal: wsl-exit-hetzner2-decommission

## Why

`gekko-hetzner-2` (10.20.0.4) fehlt seit dem Join vor 85 Tagen im Cluster
(`kubectl get nodes` zeigt nur hetzner-3/-4 und pk-hetzner-4/6/8), die
Maschine ist aber ping-bar. Longhorn meldet `READY=False`, Folge: das
Prometheus-PVC (monitoring, ~38 GB) hängt bei `robustness=degraded` — ein
weiterer Node-Ausfall würde die Monitoring-Historie gefährden.

Operator-Entscheidung vom 2026-08-24: **Dekommissionieren**, kein Rejoin.
Die Maschine wird nicht repariert; Longhorn baut die Replicas auf den
verbleibenden Worker-Nodes (hetzner-3/-4) neu auf.

_Ticket: T016425_ · Parent-Epic: T016422 (WSL-Exit)

## What Changes

1. **Runbook** `docs/runbooks/decommission-k3s-node.md`: verbindliche
   Reihenfolge — Vorprüfung (kein gebundener Workload/Local-PV) →
   `kubectl delete node gekko-hetzner-2` → Longhorn-Replica-Rebuild auf
   hetzner-3/-4 verifizieren → Prometheus-PVC wieder `robustness=healthy`
   → Hetzner-Server-Kündigung als manueller Operator-Schritt dokumentiert.
2. **Verifikationsskript** `scripts/factory/verify-decommission.sh`: prüft
   Node-Abwesenheit, keine Longhorn-Replicas mehr auf hetzner-2, PVC-Robustheit.
3. **Ausführungsgrenze:** Die destruktiven kubectl-Schritte führt der Operator
   aus (oder begleitete Session) — NICHT der autonome Factory-Tick. Das
   Runbook markiert jede manuelle Hürde explizit.

## Impact

- Affected specs: `fleet-operations`
- Affected code: `docs/runbooks/decommission-k3s-node.md`,
  `scripts/factory/verify-decommission.sh`
- Kein Verhalten im Repo selbst; Wirkung entfaltet das Runbook erst bei
  Operator-Ausführung gegen das Live-Fleet.
