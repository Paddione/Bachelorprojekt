## ADDED Requirements

### Requirement: Run-as-non-root baseline

The system SHALL betreiben jeden Deployment-Container der Plattform entweder
mit `securityContext.runAsNonRoot: true` (auf Pod- oder Container-Level, mit
gepinnter `runAsUser` wenn das Image keine non-root-USER-Direktive deklariert)
oder mit einem expliziten, maschinenprüfbaren Ausnahme-Kommentar
(`# runAsNonRoot-Ausnahme: <grund>`), der den technischen Zwang dokumentiert.

#### Scenario: Gehardenedes Deployment

- **GIVEN** die Deployments janus, claude-code-mcp-monolith (Container
  `kubernetes`), brett (dev), website (dev) und website (staging)
- **WHEN** deren securityContext geprüft wird
- **THEN** tragen sie pod-level `runAsNonRoot: true` +
  `seccompProfile: {type: RuntimeDefault}`
- **AND** ihre Container tragen `runAsNonRoot: true`, `runAsUser: 1000` und
  `allowPrivilegeEscalation: false`

#### Scenario: Dokumentierte Ausnahme

- **GIVEN** die Container monolith/postgres, monolith/playwright,
  monolith/github, monolith/github-binary (Init) sowie sish und mentolder-web
- **WHEN** ihr Manifest-Abschnitt geprüft wird
- **THEN** dokumentiert jeder dieser Container die Ausnahme mit dem
  maschinenlesbaren Marker `# runAsNonRoot-Ausnahme:` und einer technischen
  Begründung — als Kommentar im Container-Block oder, bei reinen
  JSON-Manifesten (keine Kommentare möglich), als Annotation am Pod-Template

#### Scenario: Keine stillen neuen Root-Container

- **GIVEN** ein beliebiges Deployment-Manifest unter k3d/
- **WHEN** ein neuer Container ohne runAsNonRoot und ohne Ausnahme-Marker
  hinzugefügt wird
- **THEN** schlägt der Guard-Test in tests/spec/security.bats fehl
