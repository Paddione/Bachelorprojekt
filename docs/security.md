# Sicherheit

## Grundregeln

1. **`.env` niemals committen** — enthält alle Passwörter und Secrets
2. **`data/` niemals committen** — enthält Benutzerdaten und Zertifikate
3. **OIDC-Secrets vor dem ersten Start setzen** — werden in den Keycloak-Realm importiert
4. **Starke Passwörter verwenden** — mindestens `openssl rand -base64 32`

## Dateien und Berechtigungen

| Datei | Berechtigung | Grund |
|-------|-------------|-------|
| `.env` | `600` (nur Owner) | Enthält alle Passwörter |
| `.env.secrets` | `600` (nur Owner) | Referenz-Secrets |
| `acme.json` | `600` (nur Owner) | Traefik verweigert Start bei falschen Rechten |
| `data/` | — | `.gitignore` schließt aus |

## Netzwerksicherheit

### Exponierte Ports

Nur drei Ports sind nach außen offen:

| Port | Service | Warum exponiert |
|------|---------|----------------|
| 80/TCP | Traefik | HTTP → HTTPS Redirect, Let's Encrypt Challenge |
| 443/TCP | Traefik | Alle Web-Dienste (verschlüsselt) |
| 10000/UDP | Jitsi JVB | Audio/Video-Mediendaten |

Alle internen Services (Datenbanken, LDAP, XMPP) sind nur im Docker-Netzwerk erreichbar.

### Firewall

Ports müssen in der Host-Firewall freigegeben werden:

```bash
# Linux (UFW)
sudo ufw allow 80/tcp comment "Homeoffice HTTP"
sudo ufw allow 443/tcp comment "Homeoffice HTTPS"
sudo ufw allow 10000/udp comment "Homeoffice Jitsi"
```

Für Windows-Firewall-Regeln und WSL2-Port-Proxy: [Firewall & Netzwerk](firewall.md).

### Router

Port-Forwarding auf die interne IP des Docker-Hosts einrichten:
- Port 80/TCP → Docker-Host
- Port 443/TCP → Docker-Host
- Port 10000/UDP → Docker-Host

Empfehlung: Dem Docker-Host eine **statische IP** im Router zuweisen.

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
- **SSL-Pflicht** für externe Verbindungen

### LLDAP

- Benutzer müssen Initial-Passwort (`ChangeMe123!`) beim ersten Login ändern
- LLDAP Web-UI nur über HTTPS (via Traefik) erreichbar
- Admin-Passwort (`LLDAP_LDAP_USER_PASS`) separat sichern

### OIDC

- Client-Secrets (`MATTERMOST_OIDC_SECRET`, `NEXTCLOUD_OIDC_SECRET`) werden nur server-seitig verwendet
- Authorization Code Flow (nicht Implicit) für maximale Sicherheit

## Secrets-Management

### Passwörter generieren

```bash
# Einzelnes starkes Passwort
openssl rand -base64 32

# Alle Passwörter auf einmal
for name in KEYCLOAK_DB MATTERMOST_DB NEXTCLOUD_DB LLDAP_DB LLDAP_JWT MATTERMOST_OIDC NEXTCLOUD_OIDC JICOFO JVB; do
  echo "${name}_PASSWORD=$(openssl rand -base64 32)"
done
```

### Secrets rotieren

1. Neues Passwort generieren
2. In `.env` eintragen
3. Betroffenen Service neustarten: `docker compose restart <service>`

> **Ausnahme:** OIDC-Secrets können nach dem ersten Keycloak-Import nicht einfach in `.env` geändert werden — sie müssen zusätzlich in der Keycloak Admin-Console aktualisiert werden.

## DuckDNS-Token

Das DuckDNS-Token erlaubt DNS-Manipulation. Bei Kompromittierung:

1. Auf [duckdns.org](https://www.duckdns.org/) einloggen
2. Token rotieren
3. Neues Token in `.env` eintragen
4. Container neustarten: `docker compose restart duckdns`

## Backup-Sicherheit

- Backup-Daten enthalten sensible Benutzerdateien
- Filen.io-Backup ist Ende-zu-Ende verschlüsselt (Filen-Feature)
- SMB-Backups liegen unverschlüsselt auf dem NAS — Zugang absichern
- Backup-Passwörter in `.env` — gleiche Schutzmaßnahmen wie andere Secrets
