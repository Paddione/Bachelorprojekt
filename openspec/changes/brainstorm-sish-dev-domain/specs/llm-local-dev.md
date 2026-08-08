## MODIFIED Requirements

### Requirement: Brainstorm Tunnel Runs on Dev Node Only
<!-- bats: brainstorm-dev-host.bats -->

The system SHALL route the brainstorm tunnel exclusively through the dev-stack sish broker
(`*.dev.mentolder.de`) and SHALL NOT ship a dedicated brainstorm-sish deployment in the
prod-mentolder or prod-fleet overlays. The guard enforcing this requirement SHALL be registered
in the offline per-PR gate (`task test:unit`) and SHALL NOT be listed in
`tests/unit/.coverage-allowlist`.

#### Scenario: Kein dediziertes brainstorm-sish-Manifest in prod-mentolder *(BATS)*
- **GIVEN** das prod-mentolder Overlay-Verzeichnis ist ausgecheckt
- **WHEN** nach `brainstorm-sish.yaml` im Overlay gesucht wird
- **THEN** die Datei existiert nicht im `prod-mentolder`-Verzeichnis

#### Scenario: prod-mentolder Kustomization referenziert brainstorm-sish nicht *(BATS)*
- **GIVEN** `prod-mentolder/kustomization.yaml` ist vorhanden
- **WHEN** die Datei nach dem String `brainstorm-sish` durchsucht wird
- **THEN** kein Treffer — die Kustomization enthält keinen Verweis auf brainstorm-sish

#### Scenario: prod-fleet/mentolder patcht brainstorm-sish nicht *(BATS)*
- **GIVEN** `prod-fleet/mentolder/kustomization.yaml` ist vorhanden
- **WHEN** die Datei nach dem String `brainstorm-sish` durchsucht wird
- **THEN** kein Treffer — das Fleet-Overlay enthält keinen Patch für brainstorm-sish

#### Scenario: Dev-Stack-sish-Broker ist vorhanden und bindet `*.dev.<domain>` *(BATS)*
- **GIVEN** `k3d/dev-stack/sish.yaml` existiert
- **WHEN** die Datei nach `name: sish` und `--bind-hosts=*.${DEV_DOMAIN}` durchsucht wird
- **THEN** beide Einträge sind vorhanden — der sish-Broker im Dev-Stack ist der alleinige Brainstorm-Host

#### Scenario: Brainstorm-Taskfile publiziert an die Dev-Domain, nicht an die Prod-Domain *(BATS)*
- **GIVEN** `Taskfile.brainstorm.yml` existiert
- **WHEN** die Datei nach `brainstorm.${PROD_DOMAIN}` oder `brainstorm.mentolder.de` durchsucht wird
- **THEN** kein Treffer für Prod-Domain-Referenzen

#### Scenario: Der Guard läuft im Offline-Gate und ist nicht stillgelegt *(BATS)*
- **GIVEN** `tests/unit/.coverage-allowlist` ist die dokumentierte Liste der aus `task test:unit`
  ausgeschlossenen Testdateien, und `tests/unit/brainstorm-dev-host.bats` prüft ausschließlich
  Repo-Dateien (kein Cluster, keine DB, kein SSH)
- **WHEN** die Ausschlussliste nach dem Eintrag `brainstorm-dev-host` durchsucht wird
- **THEN** kein Treffer — der Guard wird von `task test:unit` ausgeführt und meldet eine
  Abweichung des sish-Manifests vor dem Merge statt Monate danach
