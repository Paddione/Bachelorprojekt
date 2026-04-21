# Migration

Das Migrations-Framework ermöglicht den Import von Daten aus Slack, Microsoft Teams und Google Workspace in die Workspace-Plattform. Alle Skripte laufen lokal auf dem Rechner des Administrators.

```
Quellen                   migrate.sh             Ziele
──────────────────────    ──────────────────     ──────────────────────
Slack Export (ZIP)     ─┐                    ─→ Website Messaging
Teams GDPR-Export      ─┤  Interaktives Menü ─→ Nextcloud (Dateien,
Google Takeout (ZIP)   ─┤                    ─→   Kalender, Kontakte)
CSV / LDIF             ─┘                    ─→ Keycloak (Benutzer)
```

---

## Migrations-Assistent

```bash
# Interaktives Menü starten
scripts/migrate.sh

# Nur scannen (keine Migration)
scripts/migrate.sh --no-scan

# Trockenlauf (keine Daten ändern)
scripts/migrate.sh --dry-run
```

**Voraussetzungen:** bash 4+, curl, jq, python3, unzip

### Menü-Optionen

| Nr. | Aktion | Quelle | Ziel |
|-----|--------|--------|------|
| 1 | Slack importieren | Slack Export ZIP | Website Messaging (Chat-Räume via API) |
| 2 | Teams importieren | GDPR-Export oder lokaler Cache | Website Messaging + Nextcloud |
| 3 | Google importieren | Google Takeout | Website Messaging + Nextcloud |
| 4 | Benutzer importieren | CSV oder LDIF | Keycloak |
| 5 | Daten exportieren | Website Messaging + Nextcloud + Keycloak | ZIP-Archiv |
| 6 | Server konfigurieren | — | Verbindungsdaten setzen |
| 7 | Quellen scannen | Lokales System | Erkennung vorhandener Exporte |

---

## Import-Details

### Slack nach Website Messaging

**Skript:** `scripts/lib/slack-import.sh`

- Akzeptiert Slack Export ZIP oder entpacktes Verzeichnis
- Konvertiert Channels zu Chat-Räumen und Direktnachrichten zu DMs im Website-Messaging
- Wandelt um: Channels, Benutzer, Nachrichten, Threads, Mentions, Links
- Import via Website-API (`/api/messaging/import`)

### Microsoft Teams nach Website Messaging + Nextcloud

**Skript:** `scripts/lib/teams-import.sh`

- Unterstützt GDPR-Datenexport (myaccount.microsoft.com) und lokalen Teams-Cache
- Erkennt Export-Typ automatisch
- Chat-Nachrichten → Website Messaging (Chat-Räume)
- Dateien → Nextcloud (WebDAV)
- Kalender → `.ics`-Dateien, Kontakte → `.vcf`-Dateien

### Google Workspace nach Website Messaging + Nextcloud

**Skript:** `scripts/lib/google-import.sh`

- Google Takeout Export (takeout.google.com)
- Google Chat → Website Messaging (Chat-Räume)
- Drive → Nextcloud (WebDAV)
- Kalender → Nextcloud Calendar (CalDAV)
- Kontakte → Nextcloud Contacts (CardDAV)
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

| Parameter | Beschreibung |
|-----------|-------------|
| `--csv FILE` / `--ldif FILE` | Eingabedatei |
| `--url URL` | Keycloak-URL (Standard: `http://auth.localhost`) |
| `--admin USER` | Admin-Benutzer (Standard: `admin`) |
| `--pass PASS` | Admin-Passwort |
| `--realm REALM` | Realm (Standard: `workspace`) |
| `--group GROUP` | Standardgruppe für importierte Benutzer |
| `--dry-run` | Nur anzeigen, nicht importieren |

Fehlende Gruppen werden automatisch erstellt. Importierte Benutzer erhalten temporäre Passwörter (Änderung beim ersten Login erforderlich).

---

## Datenexport

Option 5 im Migrations-Assistenten erstellt ein ZIP-Archiv mit selektiv exportierten Daten:

- **Website Messaging:** Nachrichten und Räume (JSON via API)
- **Nextcloud:** Dateien (WebDAV), Kalender (CalDAV/iCal), Kontakte (CardDAV/vCard)
- **Keycloak:** Benutzer (CSV + LDIF), Realm-Konfiguration (JSON)

**Skript:** `scripts/lib/export.sh`

---

## Quellen-Erkennung

**Skript:** `scripts/lib/scan.sh`

Scannt automatisch typische Speicherorte für vorhandene Exporte:

- Slack: Cache und Download-Verzeichnisse
- Teams: lokaler Cache und GDPR-Exporte
- Nextcloud: Desktop-Client-Synchronisierung
- Google Takeout: Download-Verzeichnisse

Erkennt Betriebssystem (Linux, macOS, WSL) und durchsucht die entsprechenden Pfade.

---

## Hilfs-Bibliothek

**Skript:** `scripts/lib/nextcloud-api.sh`

Wiederverwendbare Funktionen für Nextcloud-Operationen:

- WebDAV: Verzeichnisse erstellen, Dateien hoch-/herunterladen
- CalDAV: Kalender erstellen, `.ics` importieren/exportieren
- CardDAV: Adressbücher erstellen, `.vcf` importieren/exportieren
