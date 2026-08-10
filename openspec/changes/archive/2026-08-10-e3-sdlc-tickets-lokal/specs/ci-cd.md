## MODIFIED Requirements

### Requirement: Post-Merge Manifest-Deploy

The system SHALL, after every push to `main`, deploy changed Kubernetes manifests to both
fleet brands. It SHALL NOT write ticket state from CI: since ADR-006 stage 3 the SDLC database
lives on the Dev-Host, which GitHub Actions cannot reach. Ticket closure after a merge SHALL be
derived locally by the GitHub poller instead.

#### Scenario: Manifest-Deploy läuft nur bei manifest-relevanten Änderungen

- **GIVEN** ein Push auf `main` ändert nur `website/src/`
- **WHEN** `scripts/changed-manifests.sh HEAD~1 HEAD` läuft
- **THEN** setzt der Schritt `manifests_changed=false` — `task workspace:deploy` wird nicht ausgeführt

#### Scenario: CI schreibt keinen Ticket-Status mehr

- **GIVEN** ein Merge-Commit enthält eine Ticket-Referenz
- **WHEN** der `post-merge`-Workflow läuft
- **THEN** ruft er `scripts/ticket.sh update-status` an keiner Stelle auf
- **AND** die verbleibenden Jobs (Manifest-Erkennung, Artefakt-Rendering, Deploy) laufen unverändert

#### Scenario: Ticket-Closure entsteht lokal statt in CI

- **GIVEN** ein Pull Request mit Ticket-Referenz wurde gemergt
- **WHEN** der lokale GitHub-Poller seinen nächsten Lauf ausführt
- **THEN** wird das zugehörige Ticket in der lokalen Datenbank geschlossen, ohne dass ein
  CI-Job auf die Datenbank zugegriffen hat
