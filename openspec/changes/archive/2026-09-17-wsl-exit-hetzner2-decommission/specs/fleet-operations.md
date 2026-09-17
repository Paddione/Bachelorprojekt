# Delta Spec: fleet-operations (wsl-exit-hetzner2-decommission)

## ADDED Requirements

### Requirement: Node-Dekommissionierung folgt einem verbindlichen Runbook

Das Entfernen eines Cluster-Nodes MUSS über
`docs/runbooks/decommission-k3s-node.md` abgewickelt werden: Vorprüfung auf
gebundene Workloads, Node-Delete, Longhorn-Rebuild-Verifikation,
PVC-Robustheit-Check, erst danach Infrastruktur-Rückbau (Server-Kündigung).

#### Scenario: gekko-hetzner-2 wird dekommissioniert

- **GIVEN** der Operator hat beschlossen, gekko-hetzner-2 zu entfernen
- **WHEN** das Runbook vollständig abgearbeitet ist
- **THEN** taucht der Node nicht mehr in `kubectl get nodes` auf, hält
  Longhorn keine Replicas mehr auf der Node, und das Prometheus-PVC meldet
  `robustness=healthy`

### Requirement: Dekommissionierung ist operator-gegate

Destruktive Schritte (kubectl delete node, Server-Kündigung) DÜRFEN nicht vom
autonomen Factory-Tick ausgeführt werden; das Runbook MUSS sie als manuelle
Operator-Hürden markieren.

#### Scenario: Factory-Tick trifft auf Dekommissionierungs-Runbook

- **GIVEN** ein Agent arbeitet das Ticket ab
- **WHEN** es um die destruktiven kubectl-Schritte geht
- **THEN** schreibt der Agent nur Runbook/Skript und lässt die Ausführung dem
  Operator (das Skript `verify-decommission.sh` ist rein lesend)
