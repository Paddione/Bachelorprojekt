# Proposal: decommission-k3s-node-runbook

## Why

Node `gekko-hetzner-2` fehlt seit 85 Tagen im Fleet-Cluster (`kubectl get nodes`
zeigt nur hetzner-3/-4 + pk-hetzner-4/6/8), die Maschine ist ping-bar
(10.20.0.4). Longhorn meldet den Node READY=False; Folge: Prometheus-PVC
(monitoring, ~38 GB) robustness=degraded. Operator-Entscheidung 2026-08-24
(im sdlc-autopilot-Lauf bestätigt): **DEKOMMISSIONIEREN**, nicht rejoinen
(Dublette T016427 → obsolete). Der Eingriff ist destruktiv gegen das
Live-Cluster und läuft bewusst NICHT als autonomer Factory-Tick — Deliverable
dieses Tickets ist ein geprüftes Runbook, Ausführung durch den Operator bzw.
begleitete Session [T016425].

## What

Neues Runbook `docs/runbooks/decommission-k3s-node.md` (Konvention wie
bestehende Runbooks, Deutsch, bash-Blöcke) mit:

1. Vorab-Checks: Node wirklich abwesend/ping-bar verifizieren,
   Drain-Fallback prüfen (keine exklusiven Workloads mehr auf dem Node).
2. Dekommissionierung: `kubectl delete node gekko-hetzner-2`.
3. Longhorn-Rebuild: Replica-Rebuild auf hetzner-3/-4 abwarten und
   verifizieren (`longhorn-node` State Ready, Volumes healthy).
4. Prometheus-PVC: robustness wieder healthy verifizieren (~38 GB PVC im
   ns monitoring).
5. Manueller Operator-Schritt: Hetzner-Server kündigen (außerhalb des
   Clusters, dokumentiert als Checklisten-Punkt).
6. Jeder Schritt mit Verifikationskommando und erwarteter Ausgabe;
   Abbruchkriterien (z. B. Rebuild bleibt rot → Stop, Eskalation).

Keine Manifest-/Codeänderungen; reiner Doku-Deliverable plus Gates.

_Ticket: T016425_
