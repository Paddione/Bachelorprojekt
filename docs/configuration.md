# Konfiguration

Alle Einstellungen werden ueber die Datei `.env` im Projekt-Root gesteuert. Vorlage: `.env.example`.

> `.env` darf niemals committed werden — sie enthaelt Passwoerter und Secrets.

## Domains

| Variable | Beschreibung | Beispiel |
|----------|-------------|---------|
| `MM_DOMAIN` | Mattermost Chat-URL | `projekt-chat.duckdns.org` |
| `KC_DOMAIN` | Keycloak SSO-URL | `projekt-auth.duckdns.org` |
| `NC_DOMAIN` | Nextcloud Dateien-URL | `projekt-files.duckdns.org` |
| `JITSI_DOMAIN` | Jitsi Meet-URL | `projekt-meet.duckdns.org` |

## DuckDNS

| Variable | Beschreibung | Format |
|----------|-------------|--------|
| `DUCKDNS_TOKEN` | API-Token von duckdns.org | UUID (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`) |
| `DUCKDNS_SUBDOMAINS` | Alle Subdomains (ohne `.duckdns.org`) | Kommagetrennt |

## Jitsi

| Variable | Beschreibung | Hinweis |
|----------|-------------|---------|
| `JVB_ADVERTISE_IPS` | Oeffentliche IP/Domain fuer Video-Mediendaten | Gleich wie `JITSI_DOMAIN` |
| `JITSI_XMPP_SUFFIX` | Internes XMPP-Suffix | Gleich wie `JITSI_DOMAIN` |
| `JICOFO_AUTH_PASSWORD` | Jicofo XMPP-Passwort | Zufallswert |
| `JVB_AUTH_PASSWORD` | JVB XMPP-Passwort | Zufallswert |

## SSL / Let's Encrypt

| Variable | Beschreibung |
|----------|-------------|
| `ACME_EMAIL` | E-Mail fuer Let's Encrypt Registrierung |

## Speicher

| Variable | Beschreibung | Standard |
|----------|-------------|----------|
| `STORAGE_PATH` | Pfad fuer persistente Daten (NAS, USB, etc.) | `./data` |

Unterverzeichnisse werden automatisch erstellt:
- `${STORAGE_PATH}/mattermost/` — Chat-Uploads und Plugins
- `${STORAGE_PATH}/nextcloud/` — Benutzerdateien
- `${STORAGE_PATH}/traefik/letsencrypt/` — SSL-Zertifikate

## Keycloak

| Variable | Beschreibung | Generierung |
|----------|-------------|-------------|
| `KEYCLOAK_DB_PASSWORD` | PostgreSQL-Passwort | Zufallswert |
| `KEYCLOAK_ADMIN_PASSWORD` | Admin-Console-Passwort | Frei waehlbar |

## Mattermost

| Variable | Beschreibung | Generierung |
|----------|-------------|-------------|
| `MATTERMOST_DB_PASSWORD` | PostgreSQL-Passwort | Zufallswert |
| `MATTERMOST_OIDC_SECRET` | Keycloak OIDC-Client-Secret | Zufallswert |

> **Wichtig:** `MATTERMOST_OIDC_SECRET` muss VOR dem ersten Keycloak-Start gesetzt werden. Es wird automatisch in den Realm importiert.

## Nextcloud

| Variable | Beschreibung | Generierung |
|----------|-------------|-------------|
| `NEXTCLOUD_DB_PASSWORD` | PostgreSQL-Passwort | Zufallswert |
| `NEXTCLOUD_ADMIN_PASSWORD` | Admin-Account-Passwort | Frei waehlbar |
| `NEXTCLOUD_OIDC_SECRET` | Keycloak OIDC-Client-Secret | Zufallswert |

> **Wichtig:** `NEXTCLOUD_OIDC_SECRET` muss VOR dem ersten Keycloak-Start gesetzt werden.

## Backup (optional)

### Filen.io (Cloud)

| Variable | Beschreibung |
|----------|-------------|
| `FILEN_EMAIL` | Filen.io Account-E-Mail |
| `FILEN_PASSWORD` | Filen.io Passwort |
| `FILEN_REMOTE_PATH` | Zielverzeichnis auf Filen.io |

### SMB / NAS (Netzwerk)

| Variable | Beschreibung | Standard |
|----------|-------------|----------|
| `SMB_HOST` | NAS/Server IP oder Hostname | — |
| `SMB_SHARE` | Freigabename | — |
| `SMB_USER` | Benutzername | — |
| `SMB_PASS` | Passwort | — |
| `SMB_PORT` | SMB-Port | `445` |
| `SMB_DOMAIN` | Arbeitsgruppe/Domaene | `WORKGROUP` |
| `SMB_REMOTE_PATH` | Unterverzeichnis auf der Freigabe | `homeoffice-mvp` |

Beide Backup-Ziele sind unabhaengig voneinander. Leere Felder = Ziel wird uebersprungen.

## SMTP (optional)

| Variable | Beschreibung | Beispiel |
|----------|-------------|---------|
| `SMTP_HOST` | SMTP-Server | `smtp.mailbox.org` |
| `SMTP_PORT` | SMTP-Port (SSL) | `465` |
| `SMTP_USER` | SMTP-Benutzername | — |
| `SMTP_PASS` | SMTP-Passwort | — |
| `SMTP_FROM` | Absenderadresse | `noreply@example.com` |

Ein einziges Postfach reicht fuer alle Dienste (Keycloak, Mattermost, Nextcloud).

## Passwoerter generieren

Fuer alle Passwort- und Secret-Felder starke Zufallswerte verwenden — siehe [Skripte → Passwoerter generieren](scripts.md#passwörter-generieren).
