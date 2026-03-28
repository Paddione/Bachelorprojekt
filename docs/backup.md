# Backup

## Uebersicht

Das Backup laeuft automatisch taeglich um **02:00 UTC** als Docker-Container mit `rclone`. Es unterstuetzt zwei unabhaengige Ziele, die beide optional sind.

Technische Details zum Backup-Container: [Skripte → backup-entrypoint.sh](scripts.md#scriptsbackup-entrypointsh--backup-cron)

## Gesicherte Daten

| Verzeichnis | Inhalt |
|-------------|--------|
| `mattermost/` | Chat-Uploads, Plugins |
| `nextcloud/` | Alle Benutzerdateien |
| `traefik/` | SSL-Zertifikate (`acme.json`) |

**Ausgeschlossen:** `*.log`, `*.tmp`

**Methode:** `rclone sync` (inkrementell, einseitig — Quelle ist massgeblich)

## Backup-Ziele

### Filen.io (Cloud)

Kostenlos bis 10 GB: [app.filen.io](https://app.filen.io)

| Variable | Beschreibung |
|----------|-------------|
| `FILEN_EMAIL` | Filen.io Account-E-Mail |
| `FILEN_PASSWORD` | Filen.io Passwort |
| `FILEN_REMOTE_PATH` | Zielverzeichnis auf Filen.io |

### SMB / NAS (Netzwerk)

Lokales NAS oder freigegebener Ordner im Netzwerk.

| Variable | Beschreibung | Standard |
|----------|-------------|----------|
| `SMB_HOST` | NAS/Server IP oder Hostname | — |
| `SMB_SHARE` | Freigabename | — |
| `SMB_USER` | Benutzername | — |
| `SMB_PASS` | Passwort | — |
| `SMB_PORT` | SMB-Port | `445` |
| `SMB_DOMAIN` | Arbeitsgruppe/Domaene | `WORKGROUP` |
| `SMB_REMOTE_PATH` | Unterverzeichnis auf der Freigabe | `homeoffice-mvp` |

Leere Felder = Ziel wird uebersprungen. Beide Ziele koennen gleichzeitig aktiv sein.

## SMB-Share einrichten

Falls ein lokales Laufwerk als SMB-Share fuer Backups verwendet werden soll, kann `setup.sh smb` die Einrichtung uebernehmen:

1. Prueft SMB-Konfiguration aus `.env`
2. Listet verfuegbare (nicht eingehaengte) Laufwerke
3. Partitioniert (GPT) und formatiert das gewaehlte Laufwerk
4. Erstellt Mount-Point und konfiguriert `/etc/fstab`
5. Richtet Samba-Freigabe in `smb.conf` ein
6. Setzt Samba-Passwort
7. Validiert die Konfiguration

Befehle und Parameter: [Skripte → setup.sh smb](scripts.md#setupsh-smb--smb-share-einrichtung)

## Logs und manuelles Backup

Backup-Logs pruefen und manuelles Backup anstoßen — siehe [Skripte → Docker Compose](scripts.md#docker-compose--allgemeine-befehle).

## Datenbanken

Die PostgreSQL-Datenbanken (Keycloak, Mattermost, Nextcloud) werden **nicht** durch das rclone-Backup gesichert — sie liegen in Docker Volumes. Fuer ein vollstaendiges Backup muessen die Datenbanken separat exportiert werden.

Befehle: [Skripte → Datenbank-Backup](scripts.md#datenbank-backup)
