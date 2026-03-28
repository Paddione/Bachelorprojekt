# Migration

Import von Daten aus bestehenden Systemen in die Homeoffice-Plattform.

## Voraussetzungen

```bash
sudo apt install curl jq python3 unzip   # Linux / WSL
brew install curl jq python3 unzip       # macOS
```

## Migration Assistant

```bash
chmod +x scripts/migrate.sh
./scripts/migrate.sh              # Interaktives Menü
./scripts/migrate.sh --dry-run    # Nur Vorschau, keine Änderungen
```

Beim ersten Start:
1. Server-URLs und Zugangsdaten eingeben (Mattermost, Nextcloud, Keycloak)
2. Automatischer Scan nach lokalen Export-Dateien
3. Quelle auswählen oder Pfad manuell eingeben
4. Import starten

## Slack → Mattermost

### Export erstellen

> Slack → Settings & Permissions → Import/Export Data → Export → All Messages

Benötigt Workspace-Admin-Rechte.

### Importieren

```bash
./scripts/migrate.sh
# → [1] Slack importieren → ZIP-Datei auswählen
```

### Was wird importiert

| Daten | Status | Hinweis |
|-------|--------|---------|
| Öffentliche Kanäle | Vollständig | Werden als Channels in Mattermost angelegt |
| Private Kanäle | Vollständig | |
| Nachrichten | Vollständig | Mit Zeitstempeln |
| User-Konten | Vollständig | Werden in Mattermost angelegt |
| @mentions / ~channel-Links | Konvertiert | Automatisch umgewandelt |
| Dateien / Anhänge | Nur Referenz | Kein Binary-Upload |

## Microsoft Teams → Mattermost + Nextcloud

### Export erstellen

> myaccount.microsoft.com → Datenschutz → Daten herunterladen

Auswählen: Teams Chat, Dateien, Kalender, Kontakte → ZIP herunterladen. Kein Admin nötig (GDPR-Export).

### Importieren

```bash
./scripts/migrate.sh
# → [2] Teams importieren → ZIP-Datei auswählen
```

### Was wird importiert

| Quelle | Ziel | Format |
|--------|------|--------|
| Teams Chats / Kanäle | Mattermost | Nachrichten mit Zeitstempeln |
| Dateien & Anhänge | Nextcloud `/Teams-Import/` | WebDAV-Upload |
| Kalender | Nextcloud Calendar | iCal `.ics` |
| Kontakte | Nextcloud Contacts | vCard `.vcf` |

## Google Workspace → Mattermost + Nextcloud

### Export erstellen

> takeout.google.com → Daten auswählen (Chat, Drive, Kalender, Kontakte) → Export erstellen

### Importieren

```bash
./scripts/migrate.sh
# → [4] Google importieren → ZIP-Datei auswählen
```

### Was wird importiert

| Quelle | Ziel | Format |
|--------|------|--------|
| Google Chat | Mattermost | Nachrichten |
| Google Drive | Nextcloud | WebDAV-Upload |
| Kalender | Nextcloud Calendar | iCal |
| Kontakte | Nextcloud Contacts | vCard |

## Benutzer-Import → Keycloak

### CSV-Import

```bash
# Über Migrations-Menü
./scripts/migrate.sh
# → [3] Benutzer importieren

# Oder direkt
./scripts/import-users.sh --csv users.csv \
  --url https://<KC_DOMAIN> \
  --pass <KEYCLOAK_ADMIN_PASSWORD>
```

**CSV-Format:**
```csv
username,email,display_name,groups,first_name,last_name
anna.schmidt,anna@example.com,Anna Schmidt,"homeoffice_users;admins",Anna,Schmidt
max.mueller,max@example.com,Max Müller,"homeoffice_users",Max,Müller
```

- `groups`: Semikolon-getrennt, werden automatisch angelegt
- Initiales Passwort: `ChangeMe123!` (muss beim ersten Login geändert werden)

### LDIF-Import

```bash
# Aus bestehendem LDAP exportieren
ldapsearch -x -H ldap://alter-server -b "dc=firma,dc=de" > export.ldif

# Importieren
./scripts/import-users.sh --ldif export.ldif \
  --url https://<KC_DOMAIN> \
  --pass <KEYCLOAK_ADMIN_PASSWORD>
```

### Vorschau

```bash
./scripts/import-users.sh --csv users.csv --dry-run
```

## Daten-Export

Der Migration Assistant kann auch Daten aus der Homeoffice-Plattform exportieren:

```bash
./scripts/migrate.sh
# → [5] Daten exportieren → Services auswählen → ZIP erstellen
```

Selektiver Export aus einzelnen oder allen Diensten.

## Automatische Erkennung

Beim Start scannt der Migration Assistant das lokale System nach:

- Slack-Export-ZIPs und lokalem Slack-Cache
- Teams-GDPR-Export und lokalem Teams-Cache
- Bestehenden Mattermost/Nextcloud-Clients

Erkannte Quellen werden im Menü direkt zur Auswahl angeboten.

## Hilfsbibliotheken

Die Migration-Logik ist in `scripts/lib/` aufgeteilt:

| Datei | Funktion |
|-------|----------|
| `scan.sh` | OS-spezifische Erkennung lokaler Exports |
| `slack-import.sh` | Slack ZIP/Cache → Mattermost JSONL |
| `teams-import.sh` | Teams GDPR-Export Parser |
| `google-import.sh` | Google Takeout Parser |
| `nextcloud-api.sh` | WebDAV/CalDAV/CardDAV API-Helfer |
| `export.sh` | Selektiver Multi-Service Export |
