## ADDED Requirements

### Requirement: Dedicated Node Rejoin Recovers Readiness

The system SHALL provide an operator-run rejoin procedure for a fleet worker node that reports
`READY=False` in Longhorn and is missing from `kubectl get nodes`, so that the node is restored as
a Ready scheduling target and Longhorn volume robustness recovers to `healthy`.
Rejoin replaces any earlier decommission decision for a ping-able node (operator decision
2026-08-24, T016442, superseding T016425).

#### Scenario: Rejoin runbook absent or incomplete

- **GIVEN** ein fleet-Worker-Node (z. B. `gekko-hetzner-2`) meldet in Longhorn `READY=False` und
  fehlt in `kubectl get nodes`, ist aber ping-bar
- **WHEN** das Rejoin-Runbook `docs/runbooks/rejoin-k3s-node.md` geprüft wird
- **THEN** existiert das Runbook und dokumentiert die Schritte: Ursache prüfen (k3s-Agent-Service),
  Node als **Agent** rejoinen, Longhorn-Node-`READY=True` prüfen, Prometheus-PVC-Robustheit
  wiederherstellen
- **AND** sind die destruktiven/live-SSH-Schritte als manuelle Operator-Schritte markiert

#### Scenario: Rejoin verification is read-only

- **GIVEN** das Verifikationsskript `scripts/factory/verify-rejoin.sh` existiert
- **WHEN** es auf einen rejoined Node ausgeführt wird
- **THEN** prüft es lesend, dass der Node im Cluster anwesend und `Ready` ist, dass der
  Longhorn-Node `READY=True` und `SCHEDULABLE=True` ist und dass kein Longhorn-Volume `degraded`
  ist, und verlässt mit Exit 0 nur bei sauberem Zustand
- **AND** enthält das Skript keine schreibenden kubectl-Verben (`create|apply|delete|patch|edit|drain|cordon`)

#### Scenario: Rejoin is guarded by a failing test

- **GIVEN** ein fleet-Worker-Node wird als nicht-ready gemeldet
- **WHEN** die BATS-Testsuite unter `tests/spec/fleet-operations/` läuft
- **THEN** schlägt der Rejoin-Test fehl, solange der Node nicht rejoined ist (`expected: FAIL`)
- **AND** wird grün, sobald die Rejoin-Voraussetzungen erfüllt sind
