# Skripte

Referenz aller Skripte und Hilfsbibliotheken.

## scripts/setup.sh — Pre-Flight Check

Validiert die Umgebung vor dem Deployment.

```bash
./scripts/setup.sh           # Interaktiv (fragt vor Reparaturen)
./scripts/setup.sh --fix     # Automatische Reparatur wo möglich
./scripts/setup.sh --check   # Nur prüfen, nichts ändern
```

### Prüfungen (11 Kategorien)

| Nr. | Prüfung | Auto-Fix |
|-----|---------|----------|
| 1 | OS-Erkennung (Linux, WSL, macOS) | — |
| 2 | Docker installiert und Daemon läuft | Nein |
| 3 | Docker Compose v2 verfügbar | Nein |
| 4 | Benutzer in `docker`-Gruppe | Ja |
| 5 | Port 80, 443, 10000/UDP frei | Nein |
| 6 | `.env` existiert | Ja (kopiert `.env.example`) |
| 7 | Alle Pflicht-Variablen gesetzt (23 Stück) | Nein |
| 8 | Keine Platzhalter (`CHANGE_ME_*`, `your@`) | Nein |
| 9 | DuckDNS-Token-Format (UUID) | Nein |
| 10 | Verzeichnisse und `acme.json` Berechtigungen | Ja |
| 11 | `docker compose config` Validierung | Nein |

**Ausgabe:** Farbcodiert — `✓` bestanden, `⚠` Warnung, `✗` fehlgeschlagen

## scripts/migrate.sh — Migration Assistant

Interaktives Menü für Datenimport und -export.

```bash
./scripts/migrate.sh              # Vollversion
./scripts/migrate.sh --dry-run    # Nur Vorschau
```

### Menüoptionen

| Option | Funktion |
|--------|----------|
| 1 | Slack → Mattermost |
| 2 | Teams → Mattermost + Nextcloud |
| 3 | Benutzer → LLDAP (CSV/LDIF) |
| 4 | Google → Mattermost + Nextcloud |
| 5 | Daten exportieren |

Details: [Migration](migration.md)

## scripts/import-users.sh — Benutzer-Import

Massenimport von Benutzern in LLDAP via GraphQL-API.

```bash
# CSV-Import
./scripts/import-users.sh --csv users.csv \
  --url http://localhost:17170 \
  --pass <LLDAP_LDAP_USER_PASS>

# LDIF-Import
./scripts/import-users.sh --ldif export.ldif \
  --url http://localhost:17170 \
  --pass <LLDAP_LDAP_USER_PASS>

# Vorschau
./scripts/import-users.sh --csv users.csv --dry-run
```

### Parameter

| Parameter | Beschreibung | Pflicht |
|-----------|-------------|---------|
| `--csv <datei>` | CSV-Datei mit Benutzerdaten | Ja (oder `--ldif`) |
| `--ldif <datei>` | LDIF-Datei mit Benutzerdaten | Ja (oder `--csv`) |
| `--url <url>` | LLDAP-URL | Ja (Standard: `http://localhost:17170`) |
| `--pass <passwort>` | LLDAP-Admin-Passwort | Ja |
| `--dry-run` | Nur Vorschau | Nein |

### CSV-Format

```csv
username,email,display_name,groups,first_name,last_name
anna.schmidt,anna@example.com,Anna Schmidt,"homeoffice_users;admins",Anna,Schmidt
```

Beispiel: `scripts/users-example.csv`

## setup.sh smb — SMB-Share Einrichtung

Richtet ein lokales Laufwerk als SMB-Freigabe für Backups ein. Benötigt `sudo`.

```bash
sudo ./scripts/setup.sh smb           # Interaktiv
sudo ./scripts/setup.sh smb --check   # Nur Laufwerke anzeigen
```

Details: [Backup](backup.md)

## setup.sh firewall — Linux-Firewall (UFW)

Verwaltet UFW-Firewall-Regeln für die drei benötigten Ports.

```bash
sudo ./scripts/setup.sh firewall setup    # Regeln anlegen
./scripts/setup.sh firewall status        # Regeln anzeigen
sudo ./scripts/setup.sh firewall remove   # Regeln entfernen
```

Regeln: 80/tcp, 443/tcp, 10000/udp. Idempotent — vorhandene Regeln werden nicht dupliziert.

## setup-windows.ps1 — Windows Setup + Firewall

PowerShell-Skript für Windows-Setup und Firewall-Regeln. Als Administrator ausführen.

```powershell
.\scripts\setup-windows.ps1                          # Quickstart
.\scripts\setup-windows.ps1 -Action Firewall-Setup   # Regeln anlegen
.\scripts\setup-windows.ps1 -Action Firewall-Status  # Regeln anzeigen
.\scripts\setup-windows.ps1 -Action Firewall-Remove  # Regeln entfernen
```

## scripts/wsl2-portproxy.ps1 — WSL2 Port-Proxy

Richtet Port-Forwarding von Windows auf WSL2 ein. Nur nötig wenn Docker in WSL2 läuft.

```powershell
.\scripts\wsl2-portproxy.ps1 -Action Setup     # Proxy anlegen
.\scripts\wsl2-portproxy.ps1 -Action Status    # Proxy anzeigen
.\scripts\wsl2-portproxy.ps1 -Action Remove    # Proxy entfernen
```

Ermittelt die WSL2-IP automatisch. Nach Neustart erneut `Setup` ausführen.

## scripts/check-connectivity.sh — Erreichbarkeitstest

Prüft HTTPS-Erreichbarkeit aller Dienste und Jitsi-UDP. Liest Domains aus `.env`.

```bash
./scripts/check-connectivity.sh          # Alle Dienste von außen prüfen
./scripts/check-connectivity.sh --local  # Nur lokale Ports prüfen
```

Details: [Firewall & Netzwerk](firewall.md)

## scripts/import-entrypoint.sh — Realm-Import

Ersetzt Umgebungsvariablen in `realm-homeoffice.json` und startet Keycloak mit automatischem Realm-Import. Wird als Custom-Entrypoint im Docker-Container verwendet.

**Ablauf:**
1. `envsubst` ersetzt `${VARIABLE}` Platzhalter in der Realm-JSON
2. Aufbereitete JSON wird als Import-Datei bereitgestellt
3. Keycloak startet mit `--import-realm`

## scripts/backup-entrypoint.sh — Backup-Cron

Konfiguriert rclone und richtet einen Cron-Job ein. Wird als Entrypoint des Backup-Containers verwendet.

**Ablauf:**
1. Konfiguriert rclone-Remotes (Filen.io, SMB) anhand der `.env`-Variablen
2. Erstellt Cron-Job für 02:00 UTC
3. Startet `crond` im Vordergrund

## Hilfsbibliotheken (scripts/lib/)

Diese Dateien werden von `migrate.sh` geladen und nicht direkt aufgerufen.

| Datei | Funktion |
|-------|----------|
| `scan.sh` | OS-spezifische Erkennung von Slack/Teams/Google-Exports und lokalen Caches |
| `slack-import.sh` | Konvertiert Slack-Export-ZIP oder lokalen Cache in Mattermost-JSONL |
| `teams-import.sh` | Parst Teams-GDPR-Export (Chats, Dateien, Kalender, Kontakte) |
| `google-import.sh` | Parst Google-Takeout-Export (Chat, Drive, Kalender, Kontakte) |
| `nextcloud-api.sh` | WebDAV-, CalDAV- und CardDAV-Helfer für Nextcloud-Uploads |
| `export.sh` | Selektiver Export aus allen Services in ein ZIP-Archiv |
