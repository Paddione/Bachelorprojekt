## ADDED Requirements

### Requirement: Wildcard-Certificate ohne Reflector-Annotationen (T002880)

The system SHALL NOT carry `reflector.v1.emberstack.eu` annotations in the
wildcard Certificate manifests (`prod/wildcard-certificate.yaml` and
`prod-fleet/staging/wildcard-certificate.yaml`), because no Reflector controller
runs in the fleet cluster. The TLS secret copies to the `coturn`,
`workspace-office` and website namespaces SHALL be maintained by the `tls-sync`
CronJob declared in `prod/reflector.yaml`.

#### Scenario: Manifeste behaupten keine Reflector-Automatik

- **GIVEN** das Repo liegt in seinem erwarteten Zustand vor
- **WHEN** `prod/wildcard-certificate.yaml`, `prod-fleet/staging/wildcard-certificate.yaml` und `prod/reflector.yaml` geprüft werden
- **THEN** enthält keines der Wildcard-Certificate-Manifeste eine `reflector.v1.emberstack.eu`-Annotation
- **AND** `prod/reflector.yaml` deklariert den `tls-sync` CronJob als Sync-Mechanismus
