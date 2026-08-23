# secret-rotation Delta

## MODIFIED Requirements

### Requirement: Prod overlay strips dev-placeholder Secret before apply

The system SHALL exclude dev-placeholder Secrets from production renders by structural separation instead of `$patch: delete` patches: plaintext dev Secrets live exclusively in the Kustomize component `components/dev-secrets/` (labelled `dev-seed: "true"`), which only the dev entrypoint `k3d-dev/kustomization.yaml` includes. `prod/kustomization.yaml` SHALL reference the `k3d` base — which contains no Secret resources — and SHALL NOT carry any Secret-targeting `$patch: delete` entry.

#### Scenario: workspace:deploy on prod environment

- **GIVEN** `components/dev-secrets/` defines `workspace-secrets` with dev values and is
  referenced only by `k3d-dev/kustomization.yaml`
- **WHEN** `task workspace:deploy ENV=mentolder` builds and applies the `prod-fleet/mentolder/` overlay
- **THEN** the rendered manifest set contains no `workspace-secrets` Secret at all; only the
  SealedSecret-decrypted version lives in the cluster

#### Scenario: Direct base apply yields no secrets (footgun eliminated)

- **GIVEN** an operator applies `k3d/kustomization.yaml` directly (without any overlay)
- **WHEN** `kubectl apply` runs
- **THEN** no Secret resources are applied — the base cannot leak credentials because it does
  not contain them; dev credentials require explicitly building `k3d-dev/`

## MODIFIED Requirements

---

### Requirement: Three-way secret consistency — schema, dev secrets, sealed secrets
<!-- bats: secrets-sync.bats -->

The system SHALL keep `environments/schema.yaml`, the dev secrets file `components/dev-secrets/workspace-secrets.yaml`, and all `environments/sealed-secrets/*.yaml` files in sync: every schema secret must exist in the dev secrets file, no orphan keys may exist in the dev file, and every `required: true` schema secret must be present in each environment's SealedSecret.

#### Scenario: Alle Schema-Secrets in der Dev-Secrets-Datei vorhanden *(BATS)*
- **GIVEN** `environments/schema.yaml` und `components/dev-secrets/workspace-secrets.yaml` sind vorhanden
- **WHEN** alle Schema-Schlüssel gegen den `workspace-secrets` Block in `components/dev-secrets/workspace-secrets.yaml` abgeglichen werden
- **THEN** kein Schema-Schlüssel fehlt in der Dev-Secrets-Datei

#### Scenario: Keine verwaisten Schlüssel in der Dev-Secrets-Datei *(BATS)*
- **GIVEN** `environments/schema.yaml` und `components/dev-secrets/workspace-secrets.yaml` sind vorhanden
- **WHEN** alle Dev-Secret-Schlüssel gegen das Schema abgeglichen werden
- **THEN** kein Schlüssel in `components/dev-secrets/workspace-secrets.yaml` ist im Schema unbekannt (kein Orphan)
