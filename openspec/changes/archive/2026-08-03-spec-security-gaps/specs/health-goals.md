## ADDED Requirements

### Requirement: CORS ist fail-closed für unbekannte Origins

The system SHALL reject unknown origins in the CORS handling instead of falling open, so that
a request from an origin not on the allowlist is not granted cross-origin access.

#### Scenario: Unbekannte Origin wird abgelehnt

- **GIVEN** eine Anfrage trägt eine Origin, die nicht auf der Allowlist steht
- **WHEN** die CORS-Prüfung läuft
- **THEN** wird die Anfrage abgelehnt
- **AND** es wird kein `Access-Control-Allow-Origin` für die unbekannte Origin gesetzt

### Requirement: OIDC-Callback prüft returnTo gegen eine Allowlist

The system SHALL validate the `returnTo` parameter of the OIDC callback against an allowlist
of absolute URLs before redirecting, so that an open-redirect vector against the login flow is
closed. Absolute React URLs and the `state` parameter SHALL be handled without bypassing the
allowlist check.

#### Scenario: returnTo ohne Allowlist-Treffer wird abgelehnt

- **GIVEN** der OIDC-Callback erhält ein `returnTo` mit einer absoluten URL
- **WHEN** die Allowlist-Prüfung läuft
- **THEN** wird die URL nur akzeptiert, wenn sie auf der Allowlist steht
- **AND** eine nicht gelistete absolute URL führt zu keinem Redirect

#### Scenario: Absolute React-URL und state-Parameter sind abgedeckt

- **GIVEN** der Callback erhält eine absolute React-URL oder einen `state`-Parameter
- **WHEN** die Prüfung läuft
- **THEN** wird die Allowlist-Prüfung nicht umgangen
- **AND** der Redirect erfolgt nur auf erlaubte Ziele

### Requirement: korczewski-Secrets enthalten alle von oauth2-proxy-terminal benötigten Keys

The system SHALL provide every workspace-secrets key that `oauth2-proxy-terminal` requires in
the korczewski secrets files, so that the gate proxy for the terminal service is not
misconfigured on that brand.

#### Scenario: korczewski-Secrets sind vollständig

- **GIVEN** die korczewski-Secrets-Dateien werden geprüft
- **WHEN** sie gegen die von `oauth2-proxy-terminal` benötigten Keys abgeglichen werden
- **THEN** enthält jede Datei alle benötigten Keys
- **AND** es fehlt kein Key

#### Scenario: livekit-egress ist als Kustomize-Manifest getrackt

- **GIVEN** `livekit-egress` wird geprüft
- **WHEN** die Manifest-Ablage geprüft wird
- **THEN** ist es als Kustomize-Manifest getrackt
- **AND** es nutzt eine Recreate-Rollout-Strategie
