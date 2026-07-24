## ADDED Requirements

### Requirement: Alertmanager Pushover/E-Mail secret carries non-empty credentials

The system SHALL ensure the `alertmanager-pushover` Secret (namespace `monitoring`)
contains non-empty `PUSHOVER_USER` and `PUSHOVER_TOKEN` values, sealed via
`task env:seal ENV=<env>`, so the `pushover` and `workspace-alerts`
`AlertmanagerConfig` resources are accepted by the prometheus-operator instead of
being silently dropped.

#### Scenario: Operator accepts the AlertmanagerConfig resources

- **GIVEN** `alertmanager-pushover` holds real, non-empty `PUSHOVER_USER`/`PUSHOVER_TOKEN` values
- **WHEN** the prometheus-operator reconciles the `monitoring` namespace
- **THEN** the operator logs contain no `skipping alertmanagerconfig ... mandatory field userKey is empty` warning for `pushover` or `workspace-alerts`

#### Scenario: Critical alerts route to a non-null receiver

- **GIVEN** the AlertmanagerConfig resources are accepted
- **WHEN** an operator inspects the merged Alertmanager config (`amtool config show` or the generated secret)
- **THEN** the effective route for `severity="critical"` resolves to the `pushover`/`email` receiver, not the default `null` receiver
