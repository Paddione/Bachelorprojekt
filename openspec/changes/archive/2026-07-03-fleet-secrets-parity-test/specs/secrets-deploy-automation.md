## ADDED Requirements

### Requirement: Sealed-Secrets-Parity-Test muss alle Dokumente eines Multi-Doc-YAML prüfen

Der Regressionstest, der Legacy- gegen Fleet-SealedSecrets vergleicht, SHALL alle
YAML-Dokumente einer Datei berücksichtigen, nicht nur das erste.

#### Scenario: Multi-Doc SealedSecret-Datei mit leeren Zwischendokumenten

- **GIVEN** eine `environments/sealed-secrets/<env>.yaml`-Datei mit mehreren durch `---`
  getrennten Dokumenten, darunter leere (`!!null`) Dokumente
- **WHEN** `tests/spec/fleet-operations.bats` die enthaltenen `encryptedData`-Keys sammelt
- **THEN** werden die Keys aus JEDEM nicht-leeren Dokument erfasst, nicht nur aus dem
  ersten

### Requirement: env-seal ordnet Shared-Namespace-Secrets über die Brand zu, nicht über den Env-Namen

`scripts/lib/seal-extra-namespaces.sh` SHALL den `owner_brand`-Filter gegen die aus
`environments/<ENV_NAME>.yaml` aufgelöste Brand (`env_vars.BRAND_ID`) prüfen, nicht gegen
den rohen `ENV_NAME`-String.

#### Scenario: Fleet-qualifizierter Env-Name mit abweichendem Brand-String

- **GIVEN** `ENV_NAME=fleet-mentolder` mit `environments/fleet-mentolder.yaml` →
  `env_vars.BRAND_ID: mentolder`, und ein Schema-Eintrag mit `owner_brand: [mentolder]`
- **WHEN** `task env:seal ENV=fleet-mentolder` läuft
- **THEN** wird das zugehörige Shared-Namespace-SealedSecret-Dokument versiegelt (nicht
  übersprungen)

#### Scenario: Legacy-Env ohne Fleet-Präfix bleibt unverändert

- **GIVEN** `ENV_NAME=mentolder` mit `env_vars.BRAND_ID: mentolder` (identisch zum
  Env-Namen)
- **WHEN** `task env:seal ENV=mentolder` läuft
- **THEN** verhält sich die Brand-Auflösung wie zuvor (kein Regressionsrisiko)
