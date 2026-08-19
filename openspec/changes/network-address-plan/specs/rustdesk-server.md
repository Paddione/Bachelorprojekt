## MODIFIED Requirements

### Requirement: REQ-RUSTDESK-WEB-001 — SSO-gegateter Web-Client-Zugriff

Das System SHALL die RustDesk-Web-Client-Ports (21118/tcp für hbbs, 21119/tcp für
hbbr) auf `${TURN_NODE}` öffnen, SHALL NOT diese Ports öffentlich ohne SSO-Gate
erreichbar machen, und SHALL Zugriff ausschließlich über den Hostnamen
`remote.mentolder.de` mit gültiger Pocket-ID-Session gewähren. `ufw` SHALL diese
Ports ausschließlich aus dem `wg-fleet`-Overlay (`10.20.0.0/24`) freigeben, nicht aus
dem öffentlichen Internet.

> Die Präfixlänge war bis T012645 als `/16` deklariert und widersprach damit
> `openspec/specs/terminal-sidekick.md` und `openspec/specs/workspace-deploy.md`, die
> dasselbe Overlay als `/24` führen. Der lebende Cluster belegt `/24`: die Knoten tragen
> `10.20.0.1` bis `10.20.0.6` (`kubectl --context fleet get nodes -o custom-columns=
> 'NAME:.metadata.name,INTERNAL:.status.addresses[0].address'`, erhoben 2026-08-19). Ein
> `/16` an dieser Stelle gäbe die Ports für 255-mal mehr Adressen frei als beabsichtigt.

#### Scenario: Direkter Portzugriff von außerhalb des Overlays schlägt fehl

- **GIVEN** hbbs/hbbr sind mit geöffneten Web-Client-Ports 21118/21119 deployed
- **WHEN** ein Verbindungsversuch auf `<öffentliche Node-IP>:21118` (oder `:21119`)
  von außerhalb des `10.20.0.0/24`-Overlays unternommen wird
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
