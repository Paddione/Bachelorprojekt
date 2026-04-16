<div class="page-hero">
  <span class="page-hero-icon">📜</span>
  <div class="page-hero-body">
    <div class="page-hero-title">Skripte</div>
    <p class="page-hero-desc">Referenz aller Bash-Hilfsskripte im <code>scripts/</code>-Verzeichnis: Setup, Migration, DSGVO-Checks, MCP-Registrierung und Stripe.</p>
    <div class="page-hero-meta">
      <span class="page-hero-tag">Für Administratoren</span>
      <span class="page-hero-tag">Bash</span>
    </div>
  </div>
  <a href="#/" class="page-hero-back">← Übersicht</a>
</div>

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

Erstellt einen Gast-Account in Keycloak (FA-11).

```bash
scripts/create-customer-guest.sh --name "Max Mustermann" --email "max@example.com"
scripts/create-customer-guest.sh --name "Test" --email "test@test.de" --dry-run
```

| Parameter | Beschreibung |
|-----------|-------------|
| `--name "Name"` | Anzeigename des Kunden |
| `--email "email"` | E-Mail-Adresse |
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
| D02 | Keine externen Tracking-Domains (google-analytics, sentry.io) |
| D03 | Alle PVCs sind lokal (keine Cloud-Storage-Klassen) |
| D04 | Keycloak Audit Events aktiviert |
| D05 | Website-API erreichbar (Health-Check) |
| D06 | Keine proprietaeren Telemetrie-Dienste (datadog, newrelic, splunk, segment, mixpanel) |
| D07 | Alle Container-Images sind Open-Source |
| D08 | SMTP-Server ist Cluster-intern (mailpit/localhost) |

### check-connectivity.sh -- Erreichbarkeitstest

Testet HTTPS-Konnektivitaet aller Workspace-Services.

```bash
scripts/check-connectivity.sh           # Produktions-Domains aus .env
scripts/check-connectivity.sh --local   # Lokale localhost-Domains
```

### import-entrypoint.sh -- Keycloak Realm-Import

Keycloak-Startskript: Substituiert Umgebungsvariablen (OIDC-Secrets, Domains) in der Realm-Template-Datei und startet Keycloak mit `--import-realm`. Wird als ConfigMap in den Keycloak-Pod gemountet.

### admin-users-setup.sh -- Admin-Benutzer einrichten

Erstellt Admin-Benutzer in Keycloak mit den erforderlichen Rollen und Berechtigungen.

```bash
scripts/admin-users-setup.sh
```

### mcp-select.sh -- Interaktiver MCP-Server-Selektor

Interaktives TUI zum Aktivieren/Deaktivieren einzelner MCP-Server. Skaliert die Replica-Anzahl der ausgewaehlten MCP-Deployments.

```bash
scripts/mcp-select.sh
```

### setup-ha-cluster.sh -- HA-Cluster auf Hetzner

Bootstrapped einen 3-Node k3s HA-Cluster auf Hetzner Bare-Metal-Servern. Installiert k3s, konfiguriert etcd-HA und richtet alle Nodes ein.

```bash
scripts/setup-ha-cluster.sh
```

### recording-setup.sh -- Talk Recording konfigurieren

Konfiguriert den Nextcloud Talk Recording-Service (spreed-Konfiguration, Recording-Secret).

```bash
scripts/recording-setup.sh
```

### talk-hpb-setup.sh -- Nextcloud Talk HPB konfigurieren

Verbindet den Nextcloud Talk-App mit dem spreed-signaling HPB, dem coturn TURN-Server und seinem STUN-Port. Liest `SIGNALING_SECRET` und `TURN_SECRET` aus dem `workspace-secrets`-Secret. Idempotent: ueberschreibt bei erneutem Ausfuehren nur die drei App-Config-Schlueessel.

```bash
scripts/talk-hpb-setup.sh
NAMESPACE=workspace scripts/talk-hpb-setup.sh
KUBE_CONTEXT=korczewski scripts/talk-hpb-setup.sh
```

Wendet zusaetzlich einen CoreDNS-Override an, damit der Nextcloud-PHP-Backend den signaling-Host intern aufloesung (wichtig fuer Produktionscluster hinter NAT).

### transcriber-setup.sh -- Live-Transkription einrichten

Legt den `transcriber-bot`-Nextcloud-User fuer den talk-transcriber-Pod an, registriert ihn als Talk-Bot (Webhook + Response) und aktiviert die Call-Transkription in spreed. Liest `TRANSCRIBER_BOT_PASSWORD` und `TRANSCRIBER_SECRET` aus `workspace-secrets`. Idempotent.

```bash
scripts/transcriber-setup.sh
```

### whiteboard-setup.sh -- Nextcloud Whiteboard konfigurieren

Installiert und konfiguriert die Nextcloud Whiteboard-App und synchronisiert das JWT-Secret mit dem laufenden Whiteboard-Backend-Pod. Prueft vor dem Schreiben, ob das Secret im k8s-Secret und im Pod uebereinstimmt. Idempotent.

```bash
scripts/whiteboard-setup.sh
NAMESPACE=workspace scripts/whiteboard-setup.sh
```

### check-updates.sh -- Image-Updates pruefen

Prueft alle Container-Images auf verfuegbare Updates und zeigt die aktuelle vs. neueste Version an.

```bash
scripts/check-updates.sh
```

### setup-wireguard.sh -- WireGuard VPN einrichten

Richtet WireGuard-VPN-Tunnel zwischen Cluster-Nodes ein (fuer Multi-Cluster-Szenarien).

```bash
scripts/setup-wireguard.sh
```

## Umgebungs-Management (scripts/env-*)

Skripte zur Verwaltung umgebungsspezifischer Konfiguration und Secrets.

| Skript | Zweck |
|--------|-------|
| `env-generate.sh` | Generiert `.env`-Dateien aus Umgebungskonfiguration (`environments/*.yaml`) |
| `env-resolve.sh` | Loest Variablen-Referenzen in Manifesten via `envsubst` auf |
| `env-seal.sh` | Verschluesselt Secrets mit Sealed Secrets Controller |
| `env-validate.sh` | Validiert Umgebungskonfiguration gegen das Schema (`environments/schema.yaml`) |

```bash
scripts/env-validate.sh environments/mentolder.yaml    # Schema-Validierung
scripts/env-generate.sh environments/mentolder.yaml    # .env generieren
scripts/env-seal.sh environments/mentolder.yaml        # Secrets versiegeln
scripts/env-resolve.sh prod/ environments/mentolder.yaml  # Manifeste ausfuellen
```

## Bibliotheks-Skripte (scripts/lib/)

Diese Skripte werden von `migrate.sh` geladen und nicht direkt ausgefuehrt.

| Skript | Zweck |
|--------|-------|
| `slack-import.sh` | Slack Export nach Nextcloud/Messaging konvertieren |
| `teams-import.sh` | Teams GDPR-Export nach Nextcloud |
| `google-import.sh` | Google Takeout nach Nextcloud (Drive, Calendar, Contacts) |
| `export.sh` | Selektiver Datenexport in ZIP-Archiv |
| `scan.sh` | Lokale Quellen-Erkennung (Slack, Teams, Google, etc.) |
| `nextcloud-api.sh` | Nextcloud WebDAV/CalDAV/CardDAV Hilfsfunktionen |
