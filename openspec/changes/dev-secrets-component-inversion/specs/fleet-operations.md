# fleet-operations Delta

## MODIFIED Requirements

### Requirement: Drei-Orte-Synchronität von Dev-Secret, patch-delete und Begründung

The system SHALL keep the dev-secret inventory auditable in ONE place: `components/dev-secrets/` is the single directory whose members are all plaintext dev Secrets (each labelled `dev-seed: "true"`). Because the prod overlay structurally excludes the component, the former three-place sync obligation (dev Secret file ↔ `$patch: delete` counterpart ↔ reasoning comment) is dissolved; a guard test SHALL instead assert that `prod/kustomization.yaml` contains no Secret-targeting patches and that every `kind: Secret` document under `k3d/` renders into the dev build only.

#### Scenario: Inventur ist Verzeichnis-scharf

- **GIVEN** ein Reviewer will wissen, welche Plaintext-Secrets im Repo liegen
- **WHEN** er `components/dev-secrets/` listet
- **THEN** findet er die vollständige Menge der Base-nahen Dev-Plaintext-Secrets — ohne
  parallele patch-delete-Liste und ohne verteilte Begründungskommentare abgleichen zu müssen

#### Scenario: Guard verhindert Rückkehr des Include-Patterns

- **GIVEN** jemand fügt dem Base `k3d/kustomization.yaml` wieder eine Secret-Datei hinzu
  oder einen Secret-`$patch: delete` in `prod/kustomization.yaml`
- **WHEN** die BATS-Suite für secret-rotation / workspace-deploy läuft
- **THEN** schlägt der Test fehl und benennt Datei sowie Ressource
