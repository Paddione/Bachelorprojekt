## ADDED Requirements

### Requirement: Bootstrap Placeholders Must Be Covered by envsubst

Every `${VAR}` placeholder appearing in a file under `flux/clusters/fleet/bootstrap/` MUST be
passed to `envsubst` by the `flux:bootstrap` task that applies it. A placeholder without a
matching `envsubst` variable is applied to the cluster verbatim, producing a resource that exists
and reports healthy while matching nothing — the failure is invisible to `READY` conditions.

#### Scenario: Placeholder without envsubst coverage is rejected

- **GIVEN** a file under `flux/clusters/fleet/bootstrap/` contains a `${VAR}` placeholder
- **WHEN** `tests/spec/flux-render-security/bootstrap-envsubst.bats` runs
- **THEN** it passes only if `VAR` is listed in the `envsubst` invocation of the `flux:bootstrap` task
- **AND** on failure the output names the file and the uncovered variable

#### Scenario: Webhook IngressRoute resolves its host

- **GIVEN** `flux:bootstrap` has been applied for a brand
- **WHEN** the IngressRoute `flux-webhook` in `flux-system` is inspected
- **THEN** its host rule contains the resolved domain rather than a literal `${FLUX_WEBHOOK_HOST}`
- **AND** its TLS secret reference names an existing secret in `flux-system`
