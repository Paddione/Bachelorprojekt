# Migration

Import von Daten aus bestehenden Systemen in die Homeoffice-Plattform.

## Voraussetzungen

Abhaengigkeiten: `curl`, `jq`, `python3`, `unzip` — siehe [Deployment → Voraussetzungen](deployment.md#voraussetzungen).

## Migration Assistant

Interaktives Menue fuer Datenimport und -export. Beim ersten Start werden Server-URLs und Zugangsdaten abgefragt, anschliessend scannt das Skript nach lokalen Export-Dateien.

Befehle und Parameter: [Skripte → migrate.sh](scripts.md#scriptsmigratesh--migration-assistant)

## Slack → Mattermost

### Export erstellen

> Slack → Settings & Permissions → Import/Export Data → Export → All Messages

Benoetigt Workspace-Admin-Rechte.

### Importieren

Im Migration Assistant Option **[1] Slack importieren** waehlen und die ZIP-Datei angeben.

### Was wird importiert

| Daten | Status | Hinweis |
|-------|--------|---------|
| Oeffentliche Kanaele | Vollstaendig | Werden als Channels in Mattermost angelegt |
| Private Kanaele | Vollstaendig | |
| Nachrichten | Vollstaendig | Mit Zeitstempeln |
| User-Konten | Vollstaendig | Werden in Mattermost angelegt |
| @mentions / ~channel-Links | Konvertiert | Automatisch umgewandelt |
| Dateien / Anhaenge | Nur Referenz | Kein Binary-Upload |

## Microsoft Teams → Mattermost + Nextcloud

### Export erstellen

> myaccount.microsoft.com → Datenschutz → Daten herunterladen

Auswaehlen: Teams Chat, Dateien, Kalender, Kontakte → ZIP herunterladen. Kein Admin noetig (GDPR-Export).

### Importieren

Im Migration Assistant Option **[2] Teams importieren** waehlen und die ZIP-Datei angeben.

### Was wird importiert

| Quelle | Ziel | Format |
|--------|------|--------|
| Teams Chats / Kanaele | Mattermost | Nachrichten mit Zeitstempeln |
| Dateien & Anhaenge | Nextcloud `/Teams-Import/` | WebDAV-Upload |
| Kalender | Nextcloud Calendar | iCal `.ics` |
| Kontakte | Nextcloud Contacts | vCard `.vcf` |

## Google Workspace → Mattermost + Nextcloud

### Export erstellen

> takeout.google.com → Daten auswaehlen (Chat, Drive, Kalender, Kontakte) → Export erstellen

### Importieren

Im Migration Assistant Option **[4] Google importieren** waehlen und die ZIP-Datei angeben.

### Was wird importiert

| Quelle | Ziel | Format |
|--------|------|--------|
| Google Chat | Mattermost | Nachrichten |
| Google Drive | Nextcloud | WebDAV-Upload |
| Kalender | Nextcloud Calendar | iCal |
| Kontakte | Nextcloud Contacts | vCard |

## Benutzer-Import → Keycloak

### CSV-Import

Ueber den Migration Assistant (Option **[3] Benutzer importieren**) oder direkt per Skript — siehe [Skripte → import-users.sh](scripts.md#scriptsimport-userssh--benutzer-import).

**CSV-Format:**

| Spalte | Beschreibung | Pflicht |
|--------|-------------|---------|
| `username` | Benutzername | Ja |
| `email` | E-Mail-Adresse | Ja |
| `display_name` | Anzeigename | Nein |
| `groups` | Gruppen (Semikolon-getrennt) | Nein |
| `first_name` | Vorname | Nein |
| `last_name` | Nachname | Nein |

Gruppen werden automatisch angelegt. Initiales Passwort: `ChangeMe123!` (muss beim ersten Login geaendert werden).

Beispiel-Datei: `scripts/users-example.csv`

### LDIF-Import

LDIF-Dateien aus einem bestehenden LDAP-Server koennen ebenfalls importiert werden. Export aus dem Quellsystem z.B. mit `ldapsearch`, dann Import per `import-users.sh --ldif` — siehe [Skripte → import-users.sh](scripts.md#scriptsimport-userssh--benutzer-import).

## Daten-Export

Der Migration Assistant kann auch Daten aus der Homeoffice-Plattform exportieren (Option **[5] Daten exportieren**). Selektiver Export aus einzelnen oder allen Diensten.

## Automatische Erkennung

Beim Start scannt der Migration Assistant das lokale System nach:

- Slack-Export-ZIPs und lokalem Slack-Cache
- Teams-GDPR-Export und lokalem Teams-Cache
- Bestehenden Mattermost/Nextcloud-Clients

Erkannte Quellen werden im Menue direkt zur Auswahl angeboten.

## Hilfsbibliotheken

Die Migration-Logik ist in `scripts/lib/` aufgeteilt — siehe [Skripte → Hilfsbibliotheken](scripts.md#hilfsbibliotheken-scriptslib).
