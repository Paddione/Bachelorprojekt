## ADDED Requirements

### Requirement: Runbook für Node-Dekommissionierung vorhanden

Das Repository SHALL ein Runbook `docs/runbooks/decommission-k3s-node.md`
führen, das die gefahrlose Entfernung eines dauerhaft verlorenen k3s-Nodes
(Longhorn-Replica-Rebuild inklusive) in nachvollziehbaren, je Schritt
verifizierbaren Kommandos beschreibt. Die Ausführung bleibt manuell
(Operator oder begleitete Session); kein autonomer Factory-Tick.

#### Scenario: Operator führt Dekommissionierung aus

- **GIVEN** der Node `gekko-hetzner-2` fehlt seit ≥ 85 Tagen im Cluster,
  ist ping-bar, Longhorn meldet READY=False und die Prometheus-PVC
  robustness ist degraded
- **WHEN** der Operator dem Runbook folgt (Vorab-Checks → delete node →
  Longhorn-Rebuild abwarten → PVC-Robustheit prüfen)
- **THEN** ist nach jedem Schritt ein Verifikationskommando mit erwarteter
  Ausgabe angegeben
- **AND** der Hetzner-Server-Abriss ist als manueller Checklisten-Punkt
  dokumentiert, nicht als Clusterschritt.

#### Scenario: Rebuild bleibt aus

- **GIVEN** der Longhorn-Replica-Rebuild auf hetzner-3/-4 kehrt nicht auf
  healthy zurück
- **WHEN** das Runbook am entsprechenden Abbruchkriterium angelangt ist
- **THEN** weist es den Operator an, den Vorgang zu stoppen und zu
  eskalieren, statt fortzufahren.
