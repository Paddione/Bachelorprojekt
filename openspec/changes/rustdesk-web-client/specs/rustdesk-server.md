## RENAMED Requirements

### Requirement: REQ-RUSTDESK-RELAY-004 — Minimale Portfläche ohne Web-Client
**Renamed-to:** REQ-RUSTDESK-WEB-001 — SSO-gegateter Web-Client-Zugriff

## MODIFIED Requirements

### Requirement: REQ-RUSTDESK-WEB-001 — SSO-gegateter Web-Client-Zugriff

Das System SHALL die RustDesk-Web-Client-Ports (21118/tcp für hbbs, 21119/tcp für
hbbr) auf `${TURN_NODE}` öffnen, SHALL NOT diese Ports öffentlich ohne SSO-Gate
erreichbar machen, und SHALL Zugriff ausschließlich über den Hostnamen
`remote.mentolder.de` mit gültiger Pocket-ID-Session gewähren. `ufw` SHALL diese
Ports ausschließlich aus dem `wg-fleet`-Overlay (`10.20.0.0/16`) freigeben, nicht aus
dem öffentlichen Internet.

#### Scenario: Direkter Portzugriff von außerhalb des Overlays schlägt fehl

- **GIVEN** hbbs/hbbr sind mit geöffneten Web-Client-Ports 21118/21119 deployed
- **WHEN** ein Verbindungsversuch auf `<öffentliche Node-IP>:21118` (oder `:21119`)
  von außerhalb des `10.20.0.0/16`-Overlays unternommen wird
- **THEN** verwirft `ufw` die Verbindung, da die Ports nur für das `wg-fleet`-Overlay
  freigegeben sind

#### Scenario: Zugriff über den öffentlichen Hostnamen erfordert eine gültige SSO-Session

- **GIVEN** `oauth2-proxy-rustdesk-web` steht vor der Bridge zu hbbs/hbbr
- **WHEN** ein Aufruf von `https://remote.mentolder.de` ohne gültige
  Pocket-ID-Session eintrifft
- **THEN** leitet `oauth2-proxy-rustdesk-web` zum Pocket-ID-Login um, statt die
  Anfrage an hbbs/hbbr durchzureichen

#### Scenario: Bestehende Session erreicht den Web-Client über die Overlay-Bridge

- **GIVEN** ein Nutzer hat eine gültige Pocket-ID-Session für `rustdesk-web`
- **WHEN** er `https://remote.mentolder.de` aufruft
- **THEN** routet Traefik über `oauth2-proxy-rustdesk-web` und die
  Service-ohne-Selector-Bridge zur Overlay-Adresse von `${TURN_NODE}` und der
  RustDesk-Web-Client wird im Browser angezeigt
