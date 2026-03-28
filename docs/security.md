# Sicherheit

## Grundregeln

1. **`.env` niemals committen** — enthaelt alle Passwoerter und Secrets
2. **`data/` niemals committen** — enthaelt Benutzerdaten und Zertifikate
3. **OIDC-Secrets vor dem ersten Start setzen** — werden in den Keycloak-Realm importiert
4. **Starke Passwoerter verwenden** — siehe [Skripte → Passwoerter generieren](scripts.md#passwörter-generieren)

## Dateien und Berechtigungen

| Datei | Berechtigung | Grund |
|-------|-------------|-------|
| `.env` | `600` (nur Owner) | Enthaelt alle Passwoerter |
| `.env.secrets` | `600` (nur Owner) | Referenz-Secrets |
| `acme.json` | `600` (nur Owner) | Traefik verweigert Start bei falschen Rechten |
| `data/` | — | `.gitignore` schliesst aus |

## Netzwerksicherheit

### Exponierte Ports

Nur drei Ports sind nach aussen offen:

| Port | Service | Warum exponiert |
|------|---------|----------------|
| 80/TCP | Traefik | HTTP → HTTPS Redirect, Let's Encrypt Challenge |
| 443/TCP | Traefik | Alle Web-Dienste (verschluesselt) |
| 10000/UDP | Jitsi JVB | Audio/Video-Mediendaten |

Alle internen Services (Datenbanken, XMPP) sind nur im Docker-Netzwerk erreichbar.

### Firewall

Ports muessen in der Host-Firewall freigegeben werden. Fuer Linux (UFW) und Windows stehen automatisierte Skripte bereit — siehe [Firewall & Netzwerk](firewall.md) und [Skripte → setup.sh firewall](scripts.md#setupsh-firewall--linux-firewall-ufw).

### Router

Port-Forwarding auf die interne IP des Docker-Hosts einrichten:
- Port 80/TCP → Docker-Host
- Port 443/TCP → Docker-Host
- Port 10000/UDP → Docker-Host

Empfehlung: Dem Docker-Host eine **statische IP** im Router zuweisen. Details: [Firewall & Netzwerk → Router](firewall.md#router--port-forwarding).

## SSL/TLS

- Automatische Zertifikate via **Let's Encrypt** (TLS-Challenge durch Traefik)
- Zertifikate in `${STORAGE_PATH}/traefik/letsencrypt/acme.json`
- Automatische Erneuerung durch Traefik
- HTTP wird automatisch auf HTTPS umgeleitet

## Authentifizierung

### Keycloak (SSO)

- **Brute-Force-Schutz** aktiviert
- **Selbstregistrierung** deaktiviert (nur Admin kann User anlegen)
- **Doppelte E-Mails** verboten
- **SSL-Pflicht** fuer externe Verbindungen

### OIDC

- Client-Secrets (`MATTERMOST_OIDC_SECRET`, `NEXTCLOUD_OIDC_SECRET`) werden nur server-seitig verwendet
- Authorization Code Flow (nicht Implicit) fuer maximale Sicherheit

## Secrets-Management

### Passwoerter generieren

Fuer alle Passwort- und Secret-Felder starke Zufallswerte verwenden — siehe [Skripte → Passwoerter generieren](scripts.md#passwörter-generieren).

### Secrets rotieren

1. Neues Passwort generieren
2. In `.env` eintragen
3. Betroffenen Service neustarten — siehe [Skripte → Docker Compose](scripts.md#docker-compose--allgemeine-befehle)

> **Ausnahme:** OIDC-Secrets koennen nach dem ersten Keycloak-Import nicht einfach in `.env` geaendert werden — sie muessen zusaetzlich in der Keycloak Admin-Console aktualisiert werden.

## DuckDNS-Token

Das DuckDNS-Token erlaubt DNS-Manipulation. Bei Kompromittierung:

1. Auf [duckdns.org](https://www.duckdns.org/) einloggen
2. Token rotieren
3. Neues Token in `.env` eintragen
4. DuckDNS-Container neustarten — siehe [Skripte → Docker Compose](scripts.md#docker-compose--allgemeine-befehle)

## Backup-Sicherheit

- Backup-Daten enthalten sensible Benutzerdateien
- Filen.io-Backup ist Ende-zu-Ende verschluesselt (Filen-Feature)
- SMB-Backups liegen unverschluesselt auf dem NAS — Zugang absichern
- Backup-Passwoerter in `.env` — gleiche Schutzmassnahmen wie andere Secrets
