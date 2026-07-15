# auth-sso — Delta (t001610, incident scope verification)

## ADDED Requirements

### Requirement: pocket-id crashloop incidents MUST have their DB-credential root cause diagnosed and annotated before a fix attempt

When the `pocket-id` deployment enters `CrashLoopBackOff` due to a database authentication failure (distinct from OIDC-client-secret drift, see T001327/T001328/T001435), the incident response SHALL diagnose the failing component (DB credential vs. OIDC client secret) and record a diagnostic annotation on the deployment manifest before any credential rotation is attempted, so the next responder does not re-diagnose from scratch.

#### Scenario: Live scope verification confirms a DB-credential failure

- **GIVEN** the `pocket-id` pod in namespace `workspace` (mentolder) is in `CrashLoopBackOff`
- **WHEN** its logs are inspected
- **THEN** a `password authentication failed for user "pocket_id"` error identifies this as a DB-credential issue, not an OIDC-client-secret drift incident
- **AND** the ticket is annotated with `component: auth`, `severity: critical`, and the blast radius (all downstream OIDC clients on the affected brand)
