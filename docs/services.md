# Services

Übersicht aller Docker-Services im Homeoffice MVP.

## Traefik (Reverse Proxy)

| Eigenschaft | Wert |
|------------|------|
| Container | `homeoffice-traefik` |
| Image | `traefik:v3.0` |
| Ports | 80 (HTTP), 443 (HTTPS) |
| Funktion | Reverse Proxy, automatische HTTPS-Zertifikate |

Traefik routet den gesamten Web-Traffic anhand von Docker-Labels. Jeder Service registriert seine Route automatisch. SSL-Zertifikate werden per Let's Encrypt (TLS-Challenge) bezogen und in `${STORAGE_PATH}/traefik/letsencrypt/acme.json` gespeichert.

**Routing-Beispiel:**
- `https://projekt-chat.duckdns.org` → Container `mattermost:8065`
- `https://projekt-files.duckdns.org` → Container `nextcloud:80`

## LLDAP (User-Verzeichnis)

| Eigenschaft | Wert |
|------------|------|
| Container | `homeoffice-lldap` + `homeoffice-lldap-db` |
| Image | `lldap/lldap:latest` + `postgres:16-alpine` |
| Ports | 17170 (Web-UI), 3890 (LDAP intern) |
| Funktion | Leichtgewichtiges User-Verzeichnis mit Web-UI |

LLDAP verwaltet alle Benutzerkonten und Gruppen. Keycloak liest per LDAP-Federation die User aus LLDAP. Neue Benutzer werden in LLDAP angelegt (Web-UI oder API) und stehen automatisch in allen Diensten zur Verfügung.

**Base DN:** `dc=${LLDAP_BASE_DOMAIN},dc=${LLDAP_BASE_TLD}`

## Keycloak (SSO / Identity Provider)

| Eigenschaft | Wert |
|------------|------|
| Container | `homeoffice-keycloak` + `homeoffice-keycloak-db` |
| Image | `quay.io/keycloak/keycloak:24.0` + `postgres:16-alpine` |
| Port | 8080 (intern via Traefik) |
| Funktion | Single Sign-On via OpenID Connect |

Keycloak ist der zentrale Identity Provider. Beim ersten Start wird der Realm `homeoffice` aus `realm-homeoffice.json` importiert. Der Realm enthält:

- OIDC-Clients für Mattermost und Nextcloud (mit Secrets aus `.env`)
- LDAP-Federation zu LLDAP (auto-sync alle 5 Minuten)
- Brute-Force-Schutz und E-Mail-Login

Details: [Keycloak & SSO](keycloak.md)

## Mattermost (Chat)

| Eigenschaft | Wert |
|------------|------|
| Container | `homeoffice-mattermost` + `homeoffice-mattermost-db` |
| Image | `mattermost/mattermost-team-edition:9.7` + `postgres:16-alpine` |
| Port | 8065 (intern via Traefik) |
| Funktion | Chat, Channels, Dateifreigabe, Jitsi-Integration |

Mattermost ist die Chat-Plattform (Slack-Alternative). Login erfolgt per Keycloak SSO. Das Jitsi-Plugin ist vorinstalliert — Video-Calls starten direkt aus dem Chat.

**Datenspeicher:** `${STORAGE_PATH}/mattermost/` (Uploads, Plugins)
**Upload-Limit:** 50 MB (via Traefik Buffering-Middleware)

## Nextcloud (Dateien)

| Eigenschaft | Wert |
|------------|------|
| Container | `homeoffice-nextcloud` + `homeoffice-nextcloud-db` |
| Image | `nextcloud:28-apache` + `postgres:16-alpine` |
| Port | 80 (intern via Traefik) |
| Funktion | Dateisynchronisation, Kalender, Kontakte |

Nextcloud ist die Datei-Plattform (Google Drive / OneDrive-Alternative). Login per Keycloak SSO. Unterstützt WebDAV, CalDAV und CardDAV.

**Datenspeicher:** `${STORAGE_PATH}/nextcloud/` (Benutzerdateien)

## Jitsi (Videokonferenzen)

Jitsi besteht aus vier Containern:

| Container | Image | Funktion |
|-----------|-------|----------|
| `homeoffice-jitsi-web` | `jitsi/web:stable` | Web-Frontend |
| `homeoffice-prosody` | `jitsi/prosody:stable` | XMPP-Server (Signaling) |
| `homeoffice-jicofo` | `jitsi/jicofo:stable` | Conference Focus (Steuerung) |
| `homeoffice-jvb` | `jitsi/jvb:stable` | Videobridge (Media) |

**Ports:**
- Web: 443/TCP (via Traefik)
- JVB: 10000/UDP (direkt, ohne Proxy — für Audio/Video-Streams)

Jitsi ist in Mattermost integriert. Ein Klick auf das Kamera-Symbol startet eine Konferenz.

## DuckDNS (Dynamic DNS)

| Eigenschaft | Wert |
|------------|------|
| Container | `homeoffice-duckdns` |
| Image | `curlimages/curl:latest` |
| Funktion | Aktualisiert DNS-Einträge alle 5 Minuten |

Der Container aktualisiert alle 5 DuckDNS-Subdomains gleichzeitig per HTTP-API. Dadurch zeigen die Domains immer auf die aktuelle öffentliche IP — auch bei dynamischer IP-Vergabe durch den ISP.

## Backup (rclone)

| Eigenschaft | Wert |
|------------|------|
| Container | `homeoffice-backup` |
| Image | `rclone/rclone:latest` |
| Zeitplan | Täglich 02:00 UTC |
| Funktion | Inkrementelle Datensicherung |

Details: [Backup](backup.md)

## Service-Abhängigkeiten

```
DuckDNS (unabhängig)

LLDAP-DB → LLDAP → Keycloak-DB → Keycloak
                                      │
                    ┌─────────────────┤
                    ▼                 ▼
Mattermost-DB → Mattermost    Nextcloud-DB → Nextcloud

Prosody → Jicofo → JVB → Jitsi-Web

Traefik (entdeckt Services via Docker Socket)
Backup (liest Storage-Volumes)
```
