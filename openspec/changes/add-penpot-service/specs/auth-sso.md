# Delta Spec: auth-sso (add-penpot-service)

## ADDED Requirements

### Requirement: Penpot-OIDC-Client wird vom Seed-Job provisioniert

The system SHALL provision a dedicated `penpot` OIDC client in Pocket ID through the
`pocket-id-client-seed` Job on every deploy, using the same idempotent pattern as
`vaultwarden` and all other services. The client secret SHALL be written into
`workspace-secrets` under the key `POCKET_ID_PENPOT_SECRET`.

#### Scenario: Penpot-Client wird angelegt

- **GIVEN** Pocket ID läuft und `POCKET_ID_API_KEY` ist gültig
- **WHEN** der `pocket-id-client-seed`-Job läuft
- **THEN** wird der Client `penpot` mit `redirect_uris` auf `https://design.<PROD_DOMAIN>/api/external-auth` angelegt
- **AND** das generierte Client-Secret wird in `workspace-secrets` als `POCKET_ID_PENPOT_SECRET` geschrieben

#### Scenario: Penpot-authentifizierung im Deployment

- **GIVEN** der Penpot-Container startet
- **WHEN** die OIDC-Umgebungsvariablen gelesen werden
- **THEN** sind `SSO_ENABLED=true`, `SSO_ONLY=true`, `SSO_PKCE=true`, `SSO_SCOPES=email profile` gesetzt
- **AND** `SSO_CLIENT_ID=penpot`, `SSO_CLIENT_SECRET` aus `workspace-secrets/POCKET_ID_PENPOT_SECRET`
- **AND** `SSO_AUTHORITY` zeigt auf `http://pocket-id:1411` (dev) oder `https://auth.<PROD_DOMAIN>` (prod)

#### Scenario: Idempotenter Re-Run

- **GIVEN** der Penpot-Client wurde bereits angelegt
- **WHEN** der Seed-Job erneut läuft
- **THEN** bleibt das bestehende Client-Secret unverändert gültig (kein invalidierung)
