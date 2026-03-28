# Deployment

## Voraussetzungen

- **Docker** + **Docker Compose v2** installiert
- Ports **80**, **443** (TCP) und **10000** (UDP) in Firewall und Router freigegeben — siehe [Firewall & Netzwerk](firewall.md)
- Account bei [duckdns.org](https://www.duckdns.org/) (kostenlos)
- Linux, macOS oder Windows mit WSL2
- Zusätzliche Pakete: `curl`, `jq`, `python3`, `unzip`

## Schritt 1: DuckDNS einrichten

DuckDNS unterstützt keine Sub-Subdomains. Jeder Dienst braucht eine eigene Subdomain.

1. Account auf [duckdns.org](https://www.duckdns.org/) anlegen
2. **4 Subdomains** anlegen (Namen frei wählbar):

| Subdomain | Dienst |
|-----------|--------|
| `projektname-chat` | Mattermost |
| `projektname-auth` | Keycloak |
| `projektname-files` | Nextcloud |
| `projektname-meet` | Jitsi |

3. Token von der Startseite kopieren

## Schritt 2: Konfiguration

`.env.example` nach `.env` kopieren und alle `CHANGE_ME_*` Werte ersetzen:

1. **Domains** — DuckDNS-Subdomains eintragen (`MM_DOMAIN`, `KC_DOMAIN`, etc.)
2. **DuckDNS** — Token und Subdomain-Liste
3. **Passwörter** — starke Zufallswerte generieren (siehe [Skripte → Passwörter generieren](scripts.md#passwörter-generieren))
4. **OIDC Secrets** — müssen VOR dem ersten Start gesetzt werden
5. **ACME_EMAIL** — gültige E-Mail für Let's Encrypt

Vollständige Variablen-Referenz: [Konfiguration](configuration.md)

## Schritt 3: Pre-Flight Check

`setup.sh` mit `--fix` ausführen — prüft und repariert die Umgebung automatisch.

Der Check validiert:
- Docker-Installation und Daemon-Status
- Docker Compose v2 verfügbar
- Benutzer in `docker`-Gruppe
- Port-Verfügbarkeit (80, 443, 10000/UDP)
- `.env` vorhanden und vollständig
- Keine Platzhalter-Werte (`CHANGE_ME_*`)
- DuckDNS-Token-Format (UUID)
- Verzeichnisstruktur und `acme.json`-Berechtigungen

Befehle und Parameter: [Skripte → setup.sh](scripts.md#scriptssetupsh--pre-flight-check)

## Schritt 4: Starten

Stack mit Docker Compose starten — siehe [Skripte → Docker Compose](scripts.md#docker-compose--allgemeine-befehle).

### Reihenfolge der Services

Docker Compose startet die Services in der richtigen Reihenfolge (via `depends_on` + Healthchecks):

1. **DuckDNS** — DNS-Einträge aktualisieren
2. **Datenbanken** — PostgreSQL-Instanzen hochfahren
3. **Keycloak** — Realm importieren, Benutzerverwaltung bereit
4. **Mattermost** — Chat mit OIDC-Login
5. **Nextcloud** — Dateien mit OIDC-Login
6. **Jitsi** — Video-Konferenzen (Prosody → Jicofo → JVB)
7. **Traefik** — Reverse Proxy, SSL-Zertifikate anfordern
8. **Backup** — Cron-Job einrichten

## Schritt 5: Erreichbarkeit testen

Erreichbarkeit aller Dienste und Jitsi-UDP mit dem Connectivity-Check prüfen. Den HTTPS-Test von einem **externen Netzwerk** ausführen (z.B. Mobilfunk-Hotspot), um das Port-Forwarding zu verifizieren.

Befehle: [Skripte → check-connectivity.sh](scripts.md#scriptscheck-connectivitysh--erreichbarkeitstest)

## Schritt 6: Benutzer anlegen

Drei Optionen — siehe [Keycloak & SSO](keycloak.md) für Details.

| Option | Methode | Beschreibung |
|--------|---------|-------------|
| A | CSV/LDIF Bulk-Import | Massenimport per Skript — [Skripte → import-users.sh](scripts.md#scriptsimport-userssh--benutzer-import) |
| B | Keycloak Admin Console | Manuell unter `https://<KC_DOMAIN>/admin` → Realm `homeoffice` → Users |
| C | LDAP/AD Federation | Bestehenden LDAP-Server anbinden — [Keycloak & SSO](keycloak.md#bestehendes-ldap--active-directory-anbinden) |

## Optionale Schritte

### Daten migrieren (Slack / Teams / Google)

Interaktiver Migration Assistant für Import bestehender Daten. Details: [Migration](migration.md), Befehle: [Skripte → migrate.sh](scripts.md#scriptsmigratesh--migration-assistant)

### SMB-Backup einrichten

Lokales Laufwerk als SMB-Freigabe für Backups konfigurieren. Details: [Backup](backup.md), Befehle: [Skripte → setup.sh smb](scripts.md#setupsh-smb--smb-share-einrichtung)

### Externen Speicher einbinden

In `.env` den Pfad `STORAGE_PATH` auf ein NAS oder USB-Laufwerk setzen. Folgende Daten werden dort gespeichert:
- `mattermost/` — Uploads, Plugins
- `nextcloud/` — Alle Benutzerdateien
- `traefik/letsencrypt/` — SSL-Zertifikate

## Stoppen und Neustarten

Alle Befehle für Stack-Lifecycle: [Skripte → Docker Compose](scripts.md#docker-compose--allgemeine-befehle)
