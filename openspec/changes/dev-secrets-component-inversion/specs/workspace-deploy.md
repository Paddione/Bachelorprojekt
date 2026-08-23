# workspace-deploy Delta

## MODIFIED Requirements

### Requirement: Kustomize-Build mit Overlay-Trennung Prod vs. Dev

#### Scenario: Dev-Deploy nutzt k3d-dev-Einstiegspunkt mit Secrets-Komponente

- **GIVEN** `ENV=dev` (Standard wenn ENV nicht gesetzt)
- **WHEN** `task workspace:deploy` ausgeführt wird
- **THEN** wird `kustomize build k3d-dev/` gebaut — die Basis `../k3d` plus der
  Kustomize-Komponente `../components/dev-secrets`
- **AND** das Ergebnis enthält Dev-Secrets aus `components/dev-secrets/` (nicht SealedSecrets),
  jedes mit Label `dev-seed: "true"`
- **AND** es werden keine TLS-Zertifikate oder Prod-Ingress-Regeln erstellt

## MODIFIED Requirements

### Requirement: Dev-Placeholder-Secrets werden in Prod-Overlays gelöscht

The system SHALL guarantee that production deploys never apply dev placeholder Secrets by structural exclusion: the `k3d` base contains no plaintext Secret resources (they live exclusively in `components/dev-secrets/`, which only `k3d-dev/` references). `prod/kustomization.yaml` SHALL NOT contain `$patch: delete` patches targeting Secrets; a prod render containing any plaintext Secret document or any `dev-seed: "true"`-labelled resource SHALL fail validation fail-closed.

#### Scenario: Deploy überschreibt keine Prod-Secrets

- **GIVEN** `workspace-secrets` im Cluster enthält rotierte Produktionspasswörter (via SealedSecrets)
- **WHEN** `task workspace:deploy ENV=mentolder` den Kustomize-Build auf den Cluster anwendet
- **THEN** enthält der Render weder ein `workspace-secrets`-Manifest noch irgendein Plaintext-Secret
- **AND** das `workspace-secrets`-Secret im Cluster behält seine Prod-Werte unverändert

#### Scenario: Prod-Render-Guard schlägt bei Leck fehl

- **GIVEN** eine Ressource mit Plaintext-Secret-Inhalt oder Label `dev-seed: "true"` landet
  aus Versehen im Base `k3d/`
- **WHEN** der Prod-Render-Validierungsschritt (Validate-/Deploy-Pfad) läuft
- **THEN** bricht er mit einer expliziten Fehlermeldung ab, die Datei und Ressourcennamen nennt

## MODIFIED Requirements

### Requirement: Kustomize-Basis enthält alle erwarteten Core-Ressourcen

#### Scenario: Vollständiger Basis-Build

- **GIVEN** `k3d/kustomization.yaml` referenziert alle Core-Manifeste und keine Secret-Dateien mehr
- **WHEN** `kubectl kustomize k3d/` ausgeführt wird
- **THEN** enthält das Ergebnis Deployments `pocket-id`, `nextcloud`, `shared-db`,
  `vaultwarden`, `mailpit`, `collabora` sowie Ingress-Regeln für `auth.*`, `files.*`,
  `office.*`, `vault.*`, `mail.*`
- **AND** das Ergebnis enthält KEIN `kind: Secret`-Dokument
- **AND** das `workspace`-Namespace-Objekt trägt `pod-security.kubernetes.io`-Labels

#### Scenario: Alle kustomization.yaml-Ressourcen existieren als Dateien

- **GIVEN** `k3d/kustomization.yaml` listet eine Menge von `resources:` auf
- **WHEN** jeder Eintrag gegen das Dateisystem geprüft wird
- **THEN** existiert jede referenzierte Datei oder jedes Verzeichnis unter `k3d/`
