## MODIFIED Requirements

### Requirement: Custom Setcap Image

The system SHALL den Collabora-Container mit einem expliziten
`securityContext.runAsNonRoot: true` betreiben, während das Custom-Setcap-
Image (`collabora-code:*-setcap`) als non-root `cool`-User läuft und die
Per-Document-Jails über effektive File-Capabilities bedient.

#### Scenario: Bind-Mount-Jail ohne Root

- **GIVEN** das Deployment `collabora` in `k3d/office-stack/collabora.yaml`
- **WHEN** der Container-securityContext geprüft wird
- **THEN** enthält er `runAsNonRoot: true`
- **AND** `allowPrivilegeEscalation` ist bewusst NICHT auf `false` gesetzt
  (Setcap-/User-Namespace-Design benötigt effektive File-Caps beim exec)
