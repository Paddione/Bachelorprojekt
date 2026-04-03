# Skripte

Referenz aller Skripte im `scripts/`-Verzeichnis.

## Hauptskripte

### migrate.sh -- Migrations-Assistent

Interaktives Menue zum Import/Export von Workspace-Daten. Siehe [Migration](migration.md) fuer Details.

```bash
scripts/migrate.sh              # Interaktives Menue
scripts/migrate.sh --dry-run    # Trockenlauf
scripts/migrate.sh --no-scan    # Ohne automatischen Scan
```

### import-users.sh -- Keycloak Benutzer-Import

Importiert Benutzer aus CSV- oder LDIF-Dateien in Keycloak.

```bash
scripts/import-users.sh --csv users.csv --url http://auth.localhost --admin admin --pass devadmin
scripts/import-users.sh --ldif users.ldif --realm workspace --group team-a
scripts/import-users.sh --csv users.csv --dry-run
```

| Parameter | Beschreibung | Standard |
|-----------|-------------|----------|
| `--csv FILE` | CSV-Eingabedatei | -- |
| `--ldif FILE` | LDIF-Eingabedatei | -- |
| `--url URL` | Keycloak-URL | http://auth.localhost |
| `--admin USER` | Admin-Benutzer | admin |
| `--pass PASS` | Admin-Passwort | -- |
| `--realm REALM` | Keycloak-Realm | workspace |
| `--group GROUP` | Standardgruppe | -- |
| `--dry-run` | Nur anzeigen | -- |

### create-customer-guest.sh -- Kunden-Gast-Account

Erstellt einen Gast-Account in Keycloak + Mattermost mit dediziertem privatem Kanal (FA-11).

```bash
scripts/create-customer-guest.sh --name "Max Mustermann" --email "max@example.com" --team "workspace"
scripts/create-customer-guest.sh --name "Test" --email "test@test.de" --dry-run
```

| Parameter | Beschreibung |
|-----------|-------------|
| `--name "Name"` | Anzeigename des Kunden |
| `--email "email"` | E-Mail-Adresse |
| `--team "team"` | Mattermost-Team |
| `--dry-run` | Nur anzeigen |

### setup.sh -- Voraussetzungen pruefen

Validiert, dass alle benoetigten Tools installiert sind.

```bash
scripts/setup.sh            # Alle Voraussetzungen pruefen
scripts/setup.sh --check    # Explizite Pruefung
```

**Prueft:** kubectl, docker, k3d, jq, curl, kustomize + Docker-Daemon-Status.

### dsgvo-compliance-check.sh -- DSGVO-Pruefung

Verifiziert DSGVO-Compliance des laufenden Clusters.

```bash
scripts/dsgvo-compliance-check.sh           # Menschenlesbare Ausgabe
scripts/dsgvo-compliance-check.sh --json    # JSON fuer Grafana
```

**Pruefungen:**

| ID | Pruefung |
|----|---------|
| D01 | Keine US-Cloud-Provider Container-Images (gcr.io, amazonaws, azurecr, mcr.microsoft) |
| D02 | Keine externen Tracking-Domains (google-analytics, telemetry.mattermost, sentry.io) |
| D03 | Alle PVCs sind lokal (keine Cloud-Storage-Klassen) |
| D04 | Keycloak Audit Events aktiviert |
| D05 | Mattermost Audit-Log erreichbar |
| D06 | Keine proprietaeren Telemetrie-Dienste (datadog, newrelic, splunk, segment, mixpanel) |
| D07 | Alle Container-Images sind Open-Source |
| D08 | SMTP-Server ist Cluster-intern (mailpit/localhost) |

### check-connectivity.sh -- Erreichbarkeitstest

Testet HTTPS-Konnektivitaet aller Workspace-Services.

```bash
scripts/check-connectivity.sh           # Produktions-Domains aus .env
scripts/check-connectivity.sh --local   # Lokale localhost-Domains
```

### stripe-setup.sh -- Stripe Payment Gateway

Registriert Stripe als Payment Gateway in Invoice Ninja.

```bash
# Umgebungsvariablen setzen, dann ausfuehren:
STRIPE_PK=pk_test_... STRIPE_SK=sk_test_... scripts/stripe-setup.sh
```

Aktiviert Kreditkarten (Visa, Mastercard, Amex) und SEPA-Zahlungen.

### import-entrypoint.sh -- Keycloak Realm-Import

Keycloak-Startskript: Substituiert Umgebungsvariablen (OIDC-Secrets, Domains) in der Realm-Template-Datei und startet Keycloak mit `--import-realm`. Wird als ConfigMap in den Keycloak-Pod gemountet.

### billing-bot-setup.sh -- billing-bot Einrichtung

Baut das billing-bot Docker-Image, pusht es in die lokale Registry und erstellt den `/billing` Slash-Command in Mattermost.

### openclaw-mattermost-setup.sh / .py -- OpenClaw Channels

Erstellt den OpenClaw-Bot und admin-only Kanaele in allen Mattermost-Teams. Verfuegbar als Bash- und Python-Variante.

### mattermost-anfragen-setup.sh -- Anfragen-Channel

Erstellt einen "Anfragen"-Kanal und Incoming-Webhook in allen Mattermost-Teams fuer das Website-Kontaktformular.

### mattermost-docs-integration.sh -- Docs in Mattermost

Integriert die Dokumentations-Site in Mattermost (Kanal "dokumentation" + Header + Ankuendigung).

## Bibliotheks-Skripte (scripts/lib/)

Diese Skripte werden von `migrate.sh` geladen und nicht direkt ausgefuehrt.

| Skript | Zweck |
|--------|-------|
| `slack-import.sh` | Slack Export nach Mattermost (JSONL) konvertieren |
| `teams-import.sh` | Teams GDPR-Export nach Mattermost + Nextcloud |
| `google-import.sh` | Google Takeout nach Mattermost + Nextcloud (Chat, Drive, Calendar, Contacts) |
| `export.sh` | Selektiver Datenexport in ZIP-Archiv |
| `scan.sh` | Lokale Quellen-Erkennung (Slack, Teams, Google, etc.) |
| `nextcloud-api.sh` | Nextcloud WebDAV/CalDAV/CardDAV Hilfsfunktionen |
