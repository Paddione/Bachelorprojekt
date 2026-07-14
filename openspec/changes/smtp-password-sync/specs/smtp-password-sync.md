## ADDED Requirements

### Requirement: SMTP password parity across SealedSecrets

The `SMTP_PASSWORD` value in `workspace-secrets` (ns `workspace`) SHALL be identical to the
`SMTP_PASSWORD` value in `alertmanager-smtp` (ns `monitoring`). Both SealedSecrets are
generated from the same plaintext source (`environments/.secrets/<env>.yaml`) via
`env:seal` + `seal-extra-namespaces.sh`. The re-seal operation SHALL encrypt both targets
from the same source so that alertmanager can send email notifications.

#### Scenario: re-sealed mentolder secrets contain identical SMTP_PASSWORD

- **GIVEN** `environments/.secrets/mentolder.yaml` contains the correct `SMTP_PASSWORD` plaintext
- **WHEN** `task env:seal ENV=mentolder` is executed
- **THEN** both `workspace-secrets` and `alertmanager-smtp` SealedSecrets in `environments/sealed-secrets/mentolder.yaml` are re-encrypted
- **AND** the decrypted `SMTP_PASSWORD` value is identical in both Secrets

#### Scenario: re-sealed fleet-mentolder secrets contain identical SMTP_PASSWORD

- **GIVEN** `environments/.secrets/fleet-mentolder.yaml` contains the correct `SMTP_PASSWORD` plaintext
- **WHEN** `task env:seal ENV=fleet-mentolder` is executed
- **THEN** both `workspace-secrets` and `alertmanager-smtp` SealedSecrets in `environments/sealed-secrets/fleet-mentolder.yaml` are re-encrypted
- **AND** the decrypted `SMTP_PASSWORD` value is identical in both Secrets

### Requirement: No schema or code changes required

The existing `environments/schema.yaml` entries for `SMTP_PASSWORD` with `extra_namespaces`
are correct. The `env:seal` and `seal-extra-namespaces.sh` scripts function as designed.
No modifications to schema, scripts, or application code are needed — the drift was caused
by a one-time partial re-seal, not a systemic defect.
