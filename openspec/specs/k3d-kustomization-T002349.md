# k3d-kustomization-T002349

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu k3d-kustomization-T002349 ergänzen._

## Requirements

### Requirement: Kustomize-Basis schreibt keine managed-by-Selektoren in Deployment-Selectors

The system SHALL set `includeSelectors: false` in `k3d/default/kustomization.yaml` so that
`managed-by: kustomize` is not written into the immutable `spec.selector.matchLabels` of
Deployments, and SHALL ensure the documented apply path `kubectl apply -k k3d/default` is
executable.

#### Scenario: kubectl apply -k scheitert nicht an immutable Selectors

- **GIVEN** `k3d/default/kustomization.yaml` setzt `includeSelectors: false`
- **WHEN** `kubectl apply --dry-run=client -k k3d/default` ausgeführt wird
- **THEN** schlägt der Apply nicht an einem immutable `spec.selector` fehl
- **AND** der dokumentierte Apply-Weg aus `mcp-gateway.md` ist ausführbar

#### Scenario: Deployment-Selector enthält nur die app-Labels

- **GIVEN** ein Deployment wird über `kubectl apply -k k3d/default` angewendet
- **WHEN** der `spec.selector.matchLabels` des Deployments geprüft wird
- **THEN** enthält er nur die vorgesehenen Labels (z. B. `app: claude-code-mcp-monolith`)
- **AND** kein `managed-by: kustomize`-Eintrag ist enthalten

<!-- merged from change delta k3d-kustomization-T002349.md (61715c0914c4) -->