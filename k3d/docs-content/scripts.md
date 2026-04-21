# Skripte-Referenz

Alle Bash-Hilfsskripte liegen im Verzeichnis `scripts/`. Sie können direkt aufgerufen oder über `task`-Tasks gestartet werden.

---

## admin-users-setup.sh

**Zweck:** Provisioniert SSO-Admin-Benutzer in Keycloak.

Erstellt die in `.env` definierten Benutzer (`KC_USER1`, `KC_USER2`) im workspace-Realm. Idempotent — vorhandene Benutzer werden aktualisiert, nicht doppelt angelegt.

```bash
bash scripts/admin-users-setup.sh

# Mit anderem Environment
ENV=mentolder bash scripts/admin-users-setup.sh

# Via Task
task workspace:admin-users-setup
```

---

## check-connectivity.sh

**Zweck:** Prüft die HTTPS-Erreichbarkeit aller Workspace-Dienste.

Liest Domains aus `.env` und sendet HTTP-Anfragen an alle konfigurierten Endpunkte.

```bash
scripts/check-connectivity.sh           # Alle Dienste prüfen
scripts/check-connectivity.sh --local   # Nur lokale Ports prüfen
```

---

## check-updates.sh

**Zweck:** Vergleicht laufende Container-Image-Digests mit ihren Registries und meldet verfügbare Updates.

Zeigt an, welche Services neuere Images haben und welche `:latest`-Images beim nächsten Neustart aktualisiert werden (imagePullPolicy: Always).

```bash
bash scripts/check-updates.sh
```

---

## dsgvo-compliance-check.sh

**Zweck:** Prüft DSGVO-Compliance des Workspace (NFA-01).

Überprüft: keine externen DNS-Auflösungen aus Pods, keine Container-Images von US-Cloud-Providern, keine Telemetrie-Abflüsse.

```bash
# Lesbare Ausgabe
bash scripts/dsgvo-compliance-check.sh

# JSON-Ausgabe für Grafana-Ingestion
bash scripts/dsgvo-compliance-check.sh --json

# Via Task
task workspace:dsgvo-check
```

---

## env-generate.sh

**Zweck:** Generiert Secrets aus dem Schema für eine Umgebung.

Liest den `secrets`-Abschnitt aus `environments/schema.yaml` und generiert zufällige Passwörter oder fragt interaktiv nach.

```bash
scripts/env-generate.sh --env <name>
scripts/env-generate.sh --env production --env-dir environments/
```

---

## env-resolve.sh

**Zweck:** Löst alle Variablen einer Umgebung auf und exportiert sie als Shell-Umgebungsvariablen.

Liest eine Umgebungsdatei zusammen mit Schema-Standardwerten.

```bash
source scripts/env-resolve.sh <env-name>
source scripts/env-resolve.sh production environments/
```

---

## env-seal.sh

**Zweck:** Verschlüsselt Plaintext-Secrets zu einem SealedSecret.

Liest Secrets aus `environments/.secrets/<name>.yaml`, baut ein temporäres K8s-Secret und verschlüsselt es mit `kubeseal`.

```bash
scripts/env-seal.sh --env <name>
scripts/env-seal.sh --env production --env-dir environments/
```

---

## env-validate.sh

**Zweck:** Validiert Umgebungsdateien gegen `environments/schema.yaml` (Pre-Deploy-Gate).

```bash
scripts/env-validate.sh --env <name>
scripts/env-validate.sh --env production --strict
scripts/env-validate.sh --drift              # Drift aller Umgebungen prüfen
scripts/env-validate.sh --env prod --schema-only
```

| Parameter | Beschreibung |
|-----------|-------------|
| `--env <name>` | Umgebung validieren |
| `--drift` | Alle Umgebungen auf Schema-Drift prüfen |
| `--schema-only` | Nur Schema-Struktur prüfen |
| `--strict` | Schlägt fehl bei unbekannten Schlüsseln |

---

## import-entrypoint.sh

**Zweck:** Interner Container-Entrypoint: ersetzt Umgebungsvariablen in `realm-workspace.json` und startet Keycloak mit `--import-realm`.

Wird als Container-Command im Keycloak-Deployment verwendet, nicht direkt aufgerufen.

---

## import-users.sh

**Zweck:** Importiert Benutzer aus CSV oder LDIF in Keycloak über die Admin REST API.

```bash
# CSV-Import
scripts/import-users.sh --csv users.csv \
  --url http://auth.localhost \
  --admin admin \
  --pass devadmin

# LDIF-Import
scripts/import-users.sh --ldif users.ldif --realm workspace

# Trockenlauf
scripts/import-users.sh --csv users.csv --dry-run
```

| Parameter | Beschreibung |
|-----------|-------------|
| `--csv FILE` | CSV-Eingabedatei |
| `--ldif FILE` | LDIF-Eingabedatei |
| `--url URL` | Keycloak-URL (Standard: `http://auth.localhost`) |
| `--admin USER` | Admin-Benutzer (Standard: `admin`) |
| `--pass PASS` | Admin-Passwort |
| `--realm REALM` | Realm (Standard: `workspace`) |
| `--group GROUP` | Standardgruppe für importierte Benutzer |
| `--dry-run` | Nur anzeigen, nicht importieren |

Fehlende Gruppen werden automatisch erstellt. Importierte Benutzer erhalten temporäre Passwörter (Änderung beim ersten Login erforderlich).

---

## keycloak-sync-secrets.sh

**Zweck:** Synchronisiert OIDC-Client-Secrets aus dem K8s-Secret `workspace-secrets` in die Keycloak-Datenbank via Admin REST API.

Idempotent — kann jederzeit mehrfach ausgeführt werden.

```bash
bash scripts/keycloak-sync-secrets.sh
```

---

## mcp-select.sh

**Zweck:** Interaktiver MCP-Server-Selektor. Generiert eine `.mcp.json` für Claude Code basierend auf der gewählten Umgebung und den MCP-Servern.

```bash
bash scripts/mcp-select.sh

# Via Task
task mcp:select
```

---

## migrate.sh

**Zweck:** Interaktives Migrations-Werkzeug zum Import von Daten aus Slack, Microsoft Teams und Google Workspace sowie zum Export.

```bash
# Interaktives Menü starten
scripts/migrate.sh

# Nur scannen (keine Migration)
scripts/migrate.sh --no-scan

# Trockenlauf
scripts/migrate.sh --dry-run
```

Menü-Optionen:

| Nr. | Aktion | Quelle | Ziel |
|-----|--------|--------|------|
| 1 | Slack importieren | Slack Export ZIP | Website Messaging |
| 2 | Teams importieren | GDPR-Export oder lokaler Cache | Website Messaging + Nextcloud |
| 3 | Google importieren | Google Takeout | Website Messaging + Nextcloud |
| 4 | Benutzer importieren | CSV oder LDIF | Keycloak |
| 5 | Daten exportieren | Website Messaging + Nextcloud + Keycloak | ZIP-Archiv |
| 6 | Server konfigurieren | — | Verbindungsdaten setzen |
| 7 | Quellen scannen | Lokales System | Erkennung vorhandener Exporte |

---

## recording-setup.sh

**Zweck:** Konfiguriert Nextcloud Talk für die Nutzung des Recording-Backends.

```bash
bash scripts/recording-setup.sh
```

Muss ausgeführt werden, nachdem der `talk-recording`-Pod deployed und Nextcloud bereit ist.
Optionale Umgebungsvariable: `KUBE_CONTEXT` (kubectl-Kontext, Standard: aktueller Kontext).

---

## seed-test-meetings.sh

**Zweck:** Befüllt die Website-Datenbank mit Test-Meetings, Transkripten und Artefakten für Entwicklungszwecke.

```bash
bash scripts/seed-test-meetings.sh         # Test-Daten einfügen
bash scripts/seed-test-meetings.sh --clean # Zuerst löschen, dann einfügen (idempotent)
```

---

## setup-ha-cluster.sh

**Zweck:** Bootet einen 3-Knoten k3s HA-Cluster auf rohen Hetzner-Servern.

```bash
bash scripts/setup-ha-cluster.sh
```

Knotenkonfiguration und IP-Adressen werden im Skript-Header definiert.

---

## setup-wireguard.sh

**Zweck:** Richtet einen WireGuard-Tunnel zwischen WSL2-Workstation und Hetzner-Knoten ein.

Aktiviert die Workstation als GPU-Worker für den Prod-Cluster.

```
Subnetz: 10.13.13.0/24
  10.13.13.1  Hetzner Node 1
  10.13.13.2  WSL2 Workstation (GPU Worker)
  10.13.13.3  Hetzner Node 2
  10.13.13.4  Hetzner Node 3
```

```bash
bash scripts/setup-wireguard.sh
```

---

## setup.sh

**Zweck:** Prüft alle Voraussetzungen für den Workspace MVP (Prerequisite Checker).

```bash
./scripts/setup.sh           # Prüfung ausführen (Standard)
./scripts/setup.sh --check   # Explizit Prüfmodus
```

Prüft das Vorhandensein aller benötigten Werkzeuge: Docker, k3d, kubectl, task, git, curl, jq.

---

## talk-hpb-setup.sh

**Zweck:** Konfiguriert Nextcloud Talk für die Nutzung des spreed-signaling HPB, des coturn TURN-Servers und des STUN-Ports.

Liest Secrets aus dem `workspace/workspace-secrets`-Secret, sodass Dev und Prod denselben Stack nutzen.

```bash
bash scripts/talk-hpb-setup.sh
```

---

## transcriber-setup.sh

**Zweck:** Legt den `transcriber-bot`-Nextcloud-Benutzer für den `talk-transcriber`-Pod an.

Idempotent — bei bereits vorhandenem Benutzer wird nur das Passwort aktualisiert.

```bash
bash scripts/transcriber-setup.sh
```

---

## whiteboard-setup.sh

**Zweck:** Installiert und konfiguriert die Nextcloud Whiteboard-App und synchronisiert das JWT-Secret mit dem Whiteboard-Collaboration-Backend.

```bash
bash scripts/whiteboard-setup.sh
```
