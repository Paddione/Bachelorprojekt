# Deployment

## Voraussetzungen

- **Docker** + **Docker Compose v2** installiert
- Ports **80**, **443** (TCP) und **10000** (UDP) in Firewall und Router freigegeben
- Account bei [duckdns.org](https://www.duckdns.org/) (kostenlos)
- Linux, macOS oder Windows mit WSL2

### System-Abhängigkeiten (für Skripte)

```bash
# Linux / WSL
sudo apt install curl jq python3 unzip

# macOS
brew install curl jq python3 unzip
```

## Schritt 1: DuckDNS einrichten

DuckDNS unterstützt keine Sub-Subdomains. Jeder Dienst braucht eine eigene Subdomain.

1. Account auf [duckdns.org](https://www.duckdns.org/) anlegen
2. **5 Subdomains** anlegen (Namen frei wählbar):

| Subdomain | Dienst |
|-----------|--------|
| `projektname-chat` | Mattermost |
| `projektname-auth` | Keycloak |
| `projektname-files` | Nextcloud |
| `projektname-meet` | Jitsi |
| `projektname-ldap` | LLDAP |

3. Token von der Startseite kopieren

## Schritt 2: Konfiguration

```bash
cp .env.example .env
nano .env
```

**Pflichtfelder** — alle `CHANGE_ME_*` Werte ersetzen:

1. **Domains** — DuckDNS-Subdomains eintragen (`MM_DOMAIN`, `KC_DOMAIN`, etc.)
2. **DuckDNS** — Token und Subdomain-Liste
3. **Passwörter** — starke Zufallswerte generieren:
   ```bash
   # Für jedes Passwort-Feld:
   openssl rand -base64 32
   ```
4. **OIDC Secrets** — müssen VOR dem ersten Start gesetzt werden
5. **ACME_EMAIL** — gültige E-Mail für Let's Encrypt

Vollständige Variablen-Referenz: [Konfiguration](configuration.md)

## Schritt 3: Pre-Flight Check

```bash
chmod +x scripts/setup.sh
./scripts/setup.sh --fix    # Prüft und repariert automatisch
```

Der Check validiert:
- Docker-Installation und Daemon-Status
- Docker Compose v2 verfügbar
- Benutzer in `docker`-Gruppe
- Port-Verfügbarkeit (80, 443, 10000/UDP)
- `.env` vorhanden und vollständig
- Keine Platzhalter-Werte (`CHANGE_ME_*`)
- DuckDNS-Token-Format (UUID)
- Verzeichnisstruktur und `acme.json`-Berechtigungen

## Schritt 4: Starten

```bash
docker compose up -d
```

### Status prüfen

```bash
# Alle Container anzeigen
docker compose ps

# DuckDNS-Updates beobachten
docker compose logs -f duckdns

# Logs eines bestimmten Services
docker compose logs -f keycloak
```

### Reihenfolge der Services

Docker Compose startet die Services in der richtigen Reihenfolge (via `depends_on` + Healthchecks):

1. **DuckDNS** — DNS-Einträge aktualisieren
2. **Datenbanken** — PostgreSQL-Instanzen hochfahren
3. **LLDAP** — User-Verzeichnis bereit
4. **Keycloak** — Realm importieren, LDAP-Federation konfigurieren
5. **Mattermost** — Chat mit OIDC-Login
6. **Nextcloud** — Dateien mit OIDC-Login
7. **Jitsi** — Video-Konferenzen (Prosody → Jicofo → JVB)
8. **Traefik** — Reverse Proxy, SSL-Zertifikate anfordern
9. **Backup** — Cron-Job einrichten

## Schritt 5: Erreichbarkeit testen

```bash
# Von einem externen Netzwerk (z.B. Mobilfunk):
curl -I https://projektname-chat.duckdns.org    # Mattermost
curl -I https://projektname-files.duckdns.org   # Nextcloud
curl -I https://projektname-auth.duckdns.org    # Keycloak

# Jitsi UDP-Erreichbarkeit:
nc -u -z -v projektname-meet.duckdns.org 10000
```

## Schritt 6: Benutzer anlegen

Drei Optionen — siehe [Keycloak & SSO](keycloak.md) für Details.

### Option A: CSV/LDIF Bulk-Import

```bash
./scripts/import-users.sh --csv users.csv \
  --url http://localhost:17170 \
  --pass <LLDAP_LDAP_USER_PASS>
```

### Option B: Manuell in LLDAP

Web-UI öffnen: `https://projektname-ldap.duckdns.org` → Benutzer anlegen

### Option C: Bestehendes LDAP/AD anbinden

Keycloak Admin → User Federation → LDAP Provider hinzufügen

## Optionale Schritte

### Daten migrieren (Slack / Teams / Google)

```bash
chmod +x scripts/migrate.sh
./scripts/migrate.sh          # Interaktives Menü
./scripts/migrate.sh --dry-run  # Vorschau ohne Änderungen
```

Details: [Migration](migration.md)

### SMB-Backup einrichten

```bash
sudo chmod +x scripts/setup-smb.sh
sudo ./scripts/setup-smb.sh
```

Details: [Backup](backup.md)

### Externen Speicher einbinden

In `.env` den Pfad setzen:
```
STORAGE_PATH=/mnt/nas/homeoffice
```

Folgende Daten werden dort gespeichert:
- `mattermost/` — Uploads, Plugins
- `nextcloud/` — Alle Benutzerdateien
- `traefik/letsencrypt/` — SSL-Zertifikate

## Stoppen und Neustarten

```bash
# Stoppen (Daten bleiben erhalten)
docker compose down

# Stoppen und Volumes löschen (ALLE DATEN WEG!)
docker compose down -v

# Neustarten
docker compose restart

# Einzelnen Service neustarten
docker compose restart mattermost
```
