## MODIFIED Requirements

### Requirement: Dead Process Reaping

The system SHALL remove registry entries whose recorded `server_pid` is a positive integer that no
longer corresponds to a running process when the reap command is invoked. A missing or non-positive
`server_pid` (e.g. entries created by `register`, which tracks no process) SHALL be treated as
"untracked" and SHALL survive reap.

#### Scenario: Eintrag mit totem PID wird bereinigt

- **GIVEN** eine Session ist registriert und ihr `server_pid`-Wert ist auf `999999` (nicht existierender Prozess) gesetzt
- **WHEN** `session-hub.sh reap` aufgerufen wird
- **THEN** der Exit-Code ist 0 und die Registry ist leer (Länge 0)

#### Scenario: Registrierter Eintrag ohne getrackten Prozess überlebt reap

- **GIVEN** eine Session wurde via `session-hub.sh register --name foo --port 18080` registriert (`server_pid = 0`)
- **WHEN** `session-hub.sh reap` aufgerufen wird
- **THEN** der Exit-Code ist 0 und die Registry enthält weiterhin genau den Eintrag mit `slug = "foo"`

## ADDED Requirements

### Requirement: Registry-Sync auf alle Website-Umgebungen

The system SHALL mirror the session registry into every configured website environment (dev and
prod website pod), so that `/api/admin/sessions` (GET/POST/DELETE) and the `sessions-purge`
CronJob operate on real data in each environment. The sync SHALL fail open: a missing context,
pod, or kubectl binary MUST NOT abort the hub command.

#### Scenario: Prod-Website-Pod erhält die Registry

- **GIVEN** der Prod-Website-Pod läuft und kubectl hat den Fleet-Kontext
- **WHEN** `session-hub.sh register …` eine Mutation an der Registry ausführt
- **THEN** enthält der Prod-Website-Pod unter seinem HOME-Pfad die aktuelle `active-sessions.json`

#### Scenario: Sync-Fehler brechen den Hub-Command nicht

- **GIVEN** der Ziel-Pod existiert nicht
- **WHEN** ein `session-hub.sh`-Subcommand die Registry schreibt
- **THEN** der Command endet erfolgreich und die lokale Registry ist korrekt geschrieben

### Requirement: Auth-Gating für session-* Subdomains

The system SHALL gate all requests to `session-<slug>.<sessions-domain>` behind Pocket ID via a
traefik forwardAuth middleware on the sessions IngressRoute. Unauthenticated requests SHALL be
redirected to the login flow; authenticated requests SHALL reach the nginx backend.

#### Scenario: Unauthentifizierter Request wird zum Login geleitet

- **GIVEN** kein gültiger Pocket-ID-Session-Cookie ist gesetzt
- **WHEN** ein Browser `https://session-demo.sessions.mentolder.de/` aufruft
- **THEN** wird er zur Pocket-ID-Anmeldeseite umgeleitet (nicht zur Board-HTML)

#### Scenario: Authentifizierter Request erreicht das Board

- **GIVEN** ein gültiger Pocket-ID-Session-Cookie ist gesetzt
- **WHEN** ein Browser `https://session-demo.sessions.mentolder.de/` aufruft
- **THEN** antwortet nginx mit HTTP 200 und liefert die HTML-Seite der Session aus

### Requirement: Zentrale Session-Domain-Konfiguration

The system SHALL derive the sessions domain from the centralized domain configuration
(`SESSIONS_DOMAIN` in `k3d/configmap-domains.yaml`) instead of hardcoding it per component: the
nginx `server_name` regex and the script-side default (`SESSION_HUB_DOMAIN`) SHALL resolve from
this configuration; the form `api_url` fallback SHALL derive from the central web domain.
Brand-pinned literals in the prod overlay (Certificate dnsNames, IngressRoute HostRegexp) remain
permitted.

#### Scenario: nginx leitet die Slug-Domain aus der zentralen Konfiguration ab

- **GIVEN** `SESSIONS_DOMAIN` ist in `k3d/configmap-domains.yaml` gesetzt
- **WHEN** die nginx-ConfigMap des sessions-server gerendert wird
- **THEN** matcht der `server_name`-Regex Subdomains von `SESSIONS_DOMAIN` und enthält kein hartes Domain-Literal

#### Scenario: Script nutzt die zentrale Domain als Default

- **GIVEN** `SESSION_HUB_DOMAIN` ist nicht exportiert
- **WHEN** `session-hub.sh register --name foo --port 18080` aufgerufen wird
- **THEN** lautet der `public_url`-Wert `https://session-foo.<SESSIONS_DOMAIN>`
