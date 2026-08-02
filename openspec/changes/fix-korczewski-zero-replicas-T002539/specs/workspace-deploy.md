## ADDED Requirements

### Requirement: Korczewski-Suspension dokumentiert

The system SHALL document the korczewski brand suspension in all agent-visible
references (CLAUDE.md, AGENTS.md) so that automated diagnostics do not treat
the zero-replica state as an incident.

#### Scenario: Agent liest CLAUDE.md nach Pod-Count

- **GIVEN** korczewski ist seit 2026-07-23 suspendiert (T002479)
- **WHEN** ein Agent liest CLAUDE.md oder AGENTS.md
- **THEN** findet er die Information "korczewski: suspended, 0 pods"
- **AND** nicht die falsche Angabe "Both brands at 26/26 pods"

### Requirement: Korczewski-Domain liefert kein leeres 503

The system SHALL serve a meaningful response for korczewski.de even when the
brand is suspended — either a static maintenance page or an HTTP redirect to
mentolder.de.

#### Scenario: Aufruf von korczewski.de während Suspension

- **GIVEN** die korczewski-Kustomization ist suspendiert, alle Pods 0/0
- **WHEN** ein Browser ruft `https://korczewski.de/` auf
- **THEN** erhält er HTTP 302 → `https://mentolder.de/` oder eine statische
  Wartungsseite mit HTTP 503 + menschenlesbarem Hinweis
- **AND** nicht einen leeren "no available server"-Fehler

### Requirement: workspace:health erkennt Suspension

The system SHALL provide `task workspace:health ENV=<brand>` that checks
deployment health and SHALL report korczewski's suspended state as
`INFO: suspended` (exit 0) rather than `ERROR: 0 replicas` (exit 1).

#### Scenario: Health-Check auf suspendiertem Brand

- **GIVEN** korczewski ist suspendiert, 0 Replicas
- **WHEN** `task workspace:health ENV=korczewski` läuft
- **THEN** exit 0 mit Meldung "korczewski: suspended (T002479, seit 2026-07-23)"
