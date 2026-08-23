## ADDED Requirements

### Requirement: REQ-RUSTDESK-RELAY-007 — On-Demand-Lifecycle für hbbs/hbbr

Das System SHALL den RustDesk-Relay-Stack (hbbs/hbbr) on-demand über
`task rustdesk:wake` hochfahren und SHALL ihn nach einer TTL (Default
30 Minuten) automatisch auf `replicas=0` zurückfahren (`rustdesk:sleep` bzw.
Sleeper-Job). Der Stack SHALL außerhalb der Flux/GitOps-Reconciliation betrieben
werden, damit imperatives Scaling nicht zurückgenudelt wird.

#### Scenario: Wake bringt gehärteten Stack hoch

- **GIVEN** hbbs und hbbr sind mit `replicas=0` skaliert oder nicht vorhanden
- **WHEN** `task rustdesk:wake` ausgeführt wird
- **THEN** werden die gehärteten Manifeste aus `k3d/rustdesk-stack/` angewendet und
  beide Deployments laufen mit `replicas=1` als non-root (uid 65534)

#### Scenario: Sleeper-Job fährt nach TTL herunter

- **GIVEN** `wake` hat den Sleeper-Job angelegt und hbbs/hbbr laufen seit mehr als
  30 Minuten
- **WHEN** der Sleeper-Job auslöst
- **THEN** sind beide Deployments auf `replicas=0` skaliert und die Pods sind
  beendet

#### Scenario: Laufende Session überlebt Wind-down

- **GIVEN** eine RustDesk-Session ist über hbbr oder direkt verbunden
- **WHEN** der Sleeper-Job skaliert hbbs/hbbr auf `replicas=0`
- **THEN** bricht die bestehende Session nicht durch den Wind-down ab, weil das
  Rendezvous nur beim Verbindungsaufbau benötigt wird

#### Scenario: Deploy ersetzt Root-Pods durch gehärtete Manifeste

- **GIVEN** im Cluster laufen noch alte hbbs/hbbr-Pods ohne securityContext
- **WHEN** `task rustdesk:deploy` ausgeführt wird
- **THEN** laufen die neuen Pods als non-root (uid 65534) mit `workingDir:
  /var/lib/rustdesk` gemäß T014553
