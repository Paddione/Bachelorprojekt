# Backup

## Übersicht

Das Backup läuft automatisch täglich um **02:00 UTC** als Docker-Container mit `rclone`. Es unterstützt zwei unabhängige Ziele, die beide optional sind.

## Gesicherte Daten

| Verzeichnis | Inhalt |
|-------------|--------|
| `mattermost/` | Chat-Uploads, Plugins |
| `nextcloud/` | Alle Benutzerdateien |
| `traefik/` | SSL-Zertifikate (`acme.json`) |

**Ausgeschlossen:** `*.log`, `*.tmp`

**Methode:** `rclone sync` (inkrementell, einseitig — Quelle ist maßgeblich)

## Backup-Ziele

### Filen.io (Cloud)

Kostenlos bis 10 GB: [app.filen.io](https://app.filen.io)

```env
FILEN_EMAIL=deine@email.de
FILEN_PASSWORD=dein-passwort
FILEN_REMOTE_PATH=homeoffice-mvp
```

### SMB / NAS (Netzwerk)

Lokales NAS oder freigegebener Ordner im Netzwerk.

```env
SMB_HOST=192.168.1.100
SMB_SHARE=backup
SMB_USER=backupuser
SMB_PASS=sicheres-passwort
SMB_PORT=445
SMB_DOMAIN=WORKGROUP
SMB_REMOTE_PATH=homeoffice-mvp
```

Leere Felder = Ziel wird übersprungen. Beide Ziele können gleichzeitig aktiv sein.

## SMB-Share einrichten

Falls ein lokales Laufwerk als SMB-Share für Backups verwendet werden soll:

```bash
sudo ./scripts/setup.sh smb
```

Das Skript:
1. Prüft SMB-Konfiguration aus `.env`
2. Listet verfügbare (nicht eingehängte) Laufwerke
3. Partitioniert (GPT) und formatiert das gewählte Laufwerk
4. Erstellt Mount-Point und konfiguriert `/etc/fstab`
5. Richtet Samba-Freigabe in `smb.conf` ein
6. Setzt Samba-Passwort
7. Validiert die Konfiguration

**Modi:**
```bash
sudo ./scripts/setup.sh smb           # Interaktive Einrichtung
sudo ./scripts/setup.sh smb --check   # Nur verfügbare Laufwerke anzeigen
```

## Logs prüfen

```bash
# Backup-Logs anzeigen
docker compose logs backup

# Backup-Logs fortlaufend verfolgen
docker compose logs -f backup

# Letzten Backup-Lauf prüfen
docker compose logs --tail 50 backup
```

## Manuelles Backup

```bash
# Container-Shell öffnen und Backup manuell anstoßen
docker compose exec backup sh -c '/backup.sh'
```

## Datenbanken

Die PostgreSQL-Datenbanken (Keycloak, Mattermost, Nextcloud, LLDAP) werden **nicht** durch das rclone-Backup gesichert — sie liegen in Docker Volumes. Für ein vollständiges Backup:

```bash
# Beispiel: Mattermost-DB sichern
docker compose exec mattermost-db pg_dump -U mattermost mattermost > mattermost-backup.sql

# Alle DBs sichern
for svc in keycloak mattermost nextcloud lldap; do
  docker compose exec ${svc}-db pg_dump -U ${svc} ${svc} > ${svc}-backup.sql
done
```
