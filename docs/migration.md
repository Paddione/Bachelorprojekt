<div class="page-hero">
  <span class="page-hero-icon">🚀</span>
  <div class="page-hero-body">
    <div class="page-hero-title">Migration</div>
    <p class="page-hero-desc">Upgrade-Pfade, Datenmigration aus Slack/Teams/Google Workspace, Rollback-Strategien und Import-Skripte.</p>
    <div class="page-hero-meta">
      <span class="page-hero-tag">Für Administratoren</span>
      <span class="page-hero-tag">Datenmigration</span>
    </div>
  </div>
  <a href="#/" class="page-hero-back">← Übersicht</a>
</div>

# Migration

## Uebersicht

Das Migrations-Framework ermoeglicht den Import von Daten aus Slack, Microsoft Teams und Google Workspace in die Workspace-Plattform. Alle Skripte laufen lokal auf dem Rechner des Benutzers.

```mermaid
flowchart LR
    subgraph Quellen ["fa:fa-file-import Quellen"]
        SL["fa:fa-hashtag Slack Export<br/>ZIP / Verzeichnis"]
        TE["fa:fa-users Teams Export<br/>GDPR / Cache"]
        GO["fa:fa-envelope Google Takeout<br/>ZIP"]
        CSV["fa:fa-file-csv CSV / LDIF<br/>Benutzerliste"]
    end

    subgraph script ["fa:fa-terminal migrate.sh"]
        M["fa:fa-list Interaktives Menue"]
    end

    subgraph Ziele ["fa:fa-bullseye Ziele"]
        MSG["fa:fa-comments Website Messaging<br/>Chat-Räume + Inbox"]
        NC["fa:fa-cloud Nextcloud<br/>Dateien + Kalender + Kontakte"]
        KC["fa:fa-key Keycloak<br/>Benutzerkonten"]
    end

    SL --> M
    TE --> M
    GO --> M
    CSV --> M

    M --> MSG
    M --> NC
    M --> KC

    style SL fill:#2a1654,color:#e8c870
    style TE fill:#1b3766,color:#e8c870
    style GO fill:#1a3d28,color:#e8c870
    style CSV fill:#1f2937,color:#aabbcc
    style M fill:#1a1a2e,color:#aabbcc
    style MSG fill:#1a3d28,color:#e8c870
    style NC fill:#083344,color:#e8c870
    style KC fill:#1b3766,color:#e8c870
```

## Migrations-Assistent

```bash
# Interaktives Menue starten
scripts/migrate.sh

# Nur scannen (keine Migration)
scripts/migrate.sh --no-scan

# Trockenlauf (keine Daten aendern)
scripts/migrate.sh --dry-run
```

**Voraussetzungen:** bash 4+, curl, jq, python3, unzip

### Menue-Optionen

| # | Aktion | Quelle | Ziel |
|---|--------|--------|------|
| 1 | Slack importieren | Slack Export ZIP | Website Messaging (Chat-Räume via API) |
| 2 | Teams importieren | GDPR-Export oder lokaler Cache | Website Messaging + Nextcloud |
| 3 | Google importieren | Google Takeout | Website Messaging + Nextcloud |
| 4 | Benutzer importieren | CSV oder LDIF | Keycloak |
| 5 | Daten exportieren | Website Messaging + Nextcloud + Keycloak | ZIP-Archiv |
| 6 | Server konfigurieren | -- | Verbindungsdaten setzen |
| 7 | Quellen scannen | Lokales System | Erkennung vorhandener Exporte |

## Import-Details

### Slack nach Website Messaging

**Skript:** `scripts/lib/slack-import.sh`

- Akzeptiert Slack Export ZIP oder entpacktes Verzeichnis
- Konvertiert Channels zu Chat-Räumen, Direktnachrichten zu DMs im Website-Messaging
- Wandelt um: Channels, Benutzer, Nachrichten, Threads, Mentions, Links
- Import via Website-API (`/api/messaging/import`)

### Microsoft Teams nach Website Messaging + Nextcloud

**Skript:** `scripts/lib/teams-import.sh`

- Unterstuetzt GDPR-Datenexport (myaccount.microsoft.com) und lokalen Teams-Cache
- Erkennt Export-Typ automatisch
- Chat-Nachrichten nach Website Messaging (Chat-Räume)
- Dateien nach Nextcloud (WebDAV)
- Kalender nach .ics, Kontakte nach .vcf

### Google Workspace nach Website Messaging + Nextcloud

**Skript:** `scripts/lib/google-import.sh`

- Google Takeout Export (takeout.google.com)
- Google Chat nach Website Messaging (Chat-Räume)
- Drive nach Nextcloud (WebDAV)
- Kalender nach Nextcloud Calendar (CalDAV)
- Kontakte nach Nextcloud Contacts (CardDAV)
- Erkennt deutsche und englische Ordnernamen

### Benutzer nach Keycloak

**Skript:** `scripts/import-users.sh`

```bash
# CSV-Import
scripts/import-users.sh --csv users.csv --url http://auth.localhost --admin admin --pass devadmin

# LDIF-Import
scripts/import-users.sh --ldif users.ldif --realm workspace

# Trockenlauf
scripts/import-users.sh --csv users.csv --dry-run
```

**Parameter:**
- `--csv FILE` / `--ldif FILE` -- Eingabedatei
- `--url URL` -- Keycloak-URL (Standard: http://auth.localhost)
- `--admin USER` -- Admin-Benutzer (Standard: admin)
- `--pass PASS` -- Admin-Passwort
- `--realm REALM` -- Realm (Standard: workspace)
- `--group GROUP` -- Standardgruppe fuer importierte Benutzer
- `--dry-run` -- Nur anzeigen, nicht importieren

Erstellt fehlende Gruppen automatisch. Setzt temporaere Passwoerter (Aenderung beim ersten Login erforderlich).

## Datenexport

Option 5 im Migrations-Assistenten erstellt ein ZIP-Archiv mit selektiv exportierten Daten:

- **Website Messaging:** Nachrichten und Räume (JSON via API)
- **Nextcloud:** Dateien (WebDAV), Kalender (CalDAV/iCal), Kontakte (CardDAV/vCard)
- **Keycloak:** Benutzer (CSV + LDIF), Realm-Konfiguration (JSON)

**Skript:** `scripts/lib/export.sh`

## Quellen-Erkennung

**Skript:** `scripts/lib/scan.sh`

Scannt automatisch typische Speicherorte fuer vorhandene Exporte:
- Slack: Cache und Download-Verzeichnisse
- Teams: lokaler Cache und GDPR-Exporte
- Nextcloud: Desktop-Client-Synchronisierung
- Google Takeout: Download-Verzeichnisse

Erkennt Betriebssystem (Linux, macOS, WSL) und durchsucht die entsprechenden Pfade.

## Hilfs-Bibliothek

**Skript:** `scripts/lib/nextcloud-api.sh`

Wiederverwendbare Funktionen fuer Nextcloud-Operationen:
- WebDAV: Verzeichnisse erstellen, Dateien hoch-/herunterladen
- CalDAV: Kalender erstellen, .ics importieren/exportieren
- CardDAV: Adressbuecher erstellen, .vcf importieren/exportieren
