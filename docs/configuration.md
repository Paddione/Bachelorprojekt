# Konfiguration

Alle Einstellungen werden über die Datei `.env` im Projekt-Root gesteuert. Vorlage: `.env.example`.

> `.env` darf niemals committed werden — sie enthält Passwörter und Secrets.

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
| `JVB_ADVERTISE_IPS` | Öffentliche IP/Domain für Video-Mediendaten | Gleich wie `JITSI_DOMAIN` |
| `JITSI_XMPP_SUFFIX` | Internes XMPP-Suffix | Gleich wie `JITSI_DOMAIN` |
| `JICOFO_AUTH_PASSWORD` | Jicofo XMPP-Passwort | `openssl rand -base64 32` |
| `JVB_AUTH_PASSWORD` | JVB XMPP-Passwort | `openssl rand -base64 32` |

## SSL / Let's Encrypt

| Variable | Beschreibung |
|----------|-------------|
| `ACME_EMAIL` | E-Mail für Let's Encrypt Registrierung |

## Speicher

| Variable | Beschreibung | Standard |
|----------|-------------|----------|
| `STORAGE_PATH` | Pfad für persistente Daten (NAS, USB, etc.) | `./data` |

Unterverzeichnisse werden automatisch erstellt:
- `${STORAGE_PATH}/mattermost/` — Chat-Uploads und Plugins
- `${STORAGE_PATH}/nextcloud/` — Benutzerdateien
- `${STORAGE_PATH}/traefik/letsencrypt/` — SSL-Zertifikate

## Keycloak

| Variable | Beschreibung | Generierung |
|----------|-------------|-------------|
| `KEYCLOAK_DB_PASSWORD` | PostgreSQL-Passwort | `openssl rand -base64 32` |
| `KEYCLOAK_ADMIN_PASSWORD` | Admin-Console-Passwort | Frei wählbar |

## Mattermost

| Variable | Beschreibung | Generierung |
|----------|-------------|-------------|
| `MATTERMOST_DB_PASSWORD` | PostgreSQL-Passwort | `openssl rand -base64 32` |
| `MATTERMOST_OIDC_SECRET` | Keycloak OIDC-Client-Secret | `openssl rand -base64 32` |

> **Wichtig:** `MATTERMOST_OIDC_SECRET` muss VOR dem ersten Keycloak-Start gesetzt werden. Es wird automatisch in den Realm importiert.

## Nextcloud

| Variable | Beschreibung | Generierung |
|----------|-------------|-------------|
| `NEXTCLOUD_DB_PASSWORD` | PostgreSQL-Passwort | `openssl rand -base64 32` |
| `NEXTCLOUD_ADMIN_PASSWORD` | Admin-Account-Passwort | Frei wählbar |
| `NEXTCLOUD_OIDC_SECRET` | Keycloak OIDC-Client-Secret | `openssl rand -base64 32` |

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
| `SMB_DOMAIN` | Arbeitsgruppe/Domäne | `WORKGROUP` |
| `SMB_REMOTE_PATH` | Unterverzeichnis auf der Freigabe | `homeoffice-mvp` |

Beide Backup-Ziele sind unabhängig voneinander. Leere Felder = Ziel wird übersprungen.

## SMTP (optional)

| Variable | Beschreibung | Beispiel |
|----------|-------------|---------|
| `SMTP_HOST` | SMTP-Server | `smtp.mailbox.org` |
| `SMTP_PORT` | SMTP-Port (SSL) | `465` |
| `SMTP_USER` | SMTP-Benutzername | — |
| `SMTP_PASS` | SMTP-Passwort | — |
| `SMTP_FROM` | Absenderadresse | `noreply@example.com` |

Ein einziges Postfach reicht für alle Dienste (Keycloak, Mattermost, Nextcloud).

## Passwörter generieren

Für alle Passwort- und Secret-Felder:

```bash
# Einzelnes Passwort
openssl rand -base64 32

# Alle auf einmal generieren
for name in KEYCLOAK_DB MATTERMOST_DB NEXTCLOUD_DB MATTERMOST_OIDC NEXTCLOUD_OIDC JICOFO JVB; do
  echo "${name}_PASSWORD=$(openssl rand -base64 32)"
done
```
