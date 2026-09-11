## ADDED Requirements

### Requirement: sessions-wildcard Certificate hat valide SESSIONS_DOMAIN

The system SHALL configure `SESSIONS_DOMAIN` in `environments/schema.yaml` and `environments/mentolder.yaml` and export it during the fleet render step, so that the Certificate `sessions-wildcard` in the `workspace` namespace does not request `*.` and gets accepted by ACME providers.

#### Scenario: Certificate sessions-wildcard rendered with valid dnsName
- **GIVEN** `environments/schema.yaml` declares `SESSIONS_DOMAIN`
- **WHEN** the fleet artifact is rendered via `scripts/flux-render-artifact.sh`
- **THEN** the `sessions-wildcard` Certificate contains `*.sessions.mentolder.de` instead of `*.`

### Requirement: flux-webhook Manifeste ohne unersetzte Platzhalter

The system SHALL define the hostnames for `certificate-flux-webhook.yaml` and `ingressroute-flux-webhook.yaml` literally as `flux-webhook.mentolder.de` so that flux-system bootstrap resources do not contain literal template placeholders.

#### Scenario: flux-webhook Certificate and IngressRoute are valid
- **GIVEN** the bootstrap manifests in `flux/clusters/fleet/bootstrap/`
- **WHEN** the manifests are inspected
- **THEN** neither resource contains literal `${PROD_DOMAIN}` or `${FLUX_WEBHOOK_HOST}` placeholders

### Requirement: ipv64 ACME-Challenge Cleanup fuer Wildcard-Zertifikate

The system SHALL support cleanup of ACME DNS-01 challenges via the ipv64 webhook provider without 403 Forbidden errors.

#### Scenario: Stale challenge cleanup succeeds
- **GIVEN** an existing failed or lingering ACME challenge resource in the cluster
- **WHEN** cert-manager triggers challenge cleanup
- **THEN** the webhook does not return HTTP 403 Forbidden for del_record

### Requirement: Rechtssichere Bereitstellung von Impressum und Datenschutz fuer korczewski.de

The system SHALL ensure that `https://korczewski.de/impressum` and `https://korczewski.de/datenschutz` return HTTP 200 with legally compliant content even while the korczewski brand workloads remain suspended.

#### Scenario: Impressum and Datenschutz return HTTP 200
- **GIVEN** korczewski brand deployments are scaled to 0
- **WHEN** an unauthenticated visitor accesses `https://korczewski.de/impressum` or `https://korczewski.de/datenschutz`
- **THEN** the response code is 200 and legal notices are displayed
