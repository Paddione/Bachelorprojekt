# korczewski-monolith-keycloak-auth

## Purpose

Der korczewski `claude-code-mcp-monolith` führt eine hybride Authentifizierung ein: Service-zu-Service-Traffic bleibt über die bestehende `mcp-auth-proxy`-nginx-Validierung von `CLUSTER_TOKEN`/`BUSINESS_TOKEN`, menschliche Nutzer werden über einen neuen `oauth2-proxy`-Sidecar im selben `mcp-auth-proxy`-Deployment per Keycloak-JWT authentifiziert. Damit ist die Parität zum mentolder monolith (T000973) hergestellt.

## Requirements

### Requirement: oauth2-proxy-Sidecar im mcp-auth-proxy Deployment

The system SHALL extract the existing `mcp-auth-proxy` Deployment from `k3d/claude-code-config.yaml` into its own manifest `k3d/claude-code-mcp-auth-proxy.yaml`, and SHALL add an `oauth2-proxy` sidecar container that validates Keycloak JWTs from the korczewski realm against the `mcp-keycloak` Keycloak client.

#### Scenario: Sidecar validiert Keycloak-JWT

- **GIVEN** ein Nutzer mit einer gültigen Keycloak-Session im korczewski-Realm
- **WHEN** er `/api/mcp/user` aufruft
- **THEN** leitet der Sidecar die Anfrage an den `mcp-auth-proxy` durch
- **AND** der Proxy validiert das JWT gegen das Keycloak-JWKS-Endpoint des korczewski-Realm

### Requirement: MCP_KEYCLOAK_CLIENT_* SealedSecrets für korczewski

The system SHALL add `MCP_KEYCLOAK_CLIENT_ID`, `MCP_KEYCLOAK_CLIENT_SECRET`, and `MCP_KEYCLOAK_REALM_URL` entries to `environments/sealed-secrets/korczewski.yaml`, sourced from `environments/.secrets/korczewski.yaml` and registered in `environments/schema.yaml`.

### Requirement: IngressRoute für /api/mcp/user

The system SHALL add an IngressRoute in `k3d/ingress.yaml` that routes `PathPrefix(/api/mcp/user)` to the new `mcp-auth-proxy` Service.

#### Scenario: /api/mcp/user ist hinter Keycloak geschützt

- **GIVEN** ein unauthentifizierter Client ruft `GET /api/mcp/user` auf
- **WHEN** die Anfrage den Ingress erreicht
- **THEN** leitet der Sidecar den Client zum Keycloak-Login weiter (HTTP 302)
- **AND** ein authentifizierter Client erhält HTTP 200 mit den User-Claims

### Requirement: NetworkPolicy-Änderung explizit ausgeschlossen

The system SHALL NOT introduce a NetworkPolicy change in this PR (deferred per user decision 2026-06-21).

<!-- from archive/2026-06-22-korczewski-monolith-keycloak-auth/tasks.md lines 1-50 -->
