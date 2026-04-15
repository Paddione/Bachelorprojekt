# Services

> **Hinweis für Mitarbeiter:** Eine verständliche Erklärung aller Dienste mit konkreten Anwendungsbeispielen findest Du im [Benutzerhandbuch](benutzerhandbuch.md). Diese Seite enthält die technischen Details für Administratoren.

Alle Services laufen als Kubernetes Deployments. Jeder Service hat definierte Resource Requests/Limits und Health Checks.

## Kern-Services

### Keycloak (SSO)

**Für Mitarbeiter:** Keycloak ist der zentrale Login-Dienst. Du loggst Dich einmal ein und bist danach automatisch in allen anderen Diensten angemeldet (Single Sign-On). Keycloak verwaltet auch Passwort-Regeln und Benutzerkonten.

| Eigenschaft | Wert |
|-------------|------|
| Image | `quay.io/keycloak/keycloak:26.6` |
| Port | 8080 |
| URL | http://auth.localhost |
| Datenbank | PostgreSQL (shared-db/keycloak) |
| Resources | 250m--1 CPU, 512Mi--1Gi RAM |
| Manifest | `k3d/keycloak.yaml` |

OIDC-Provider fuer alle Services. Realm `workspace` wird beim Start automatisch importiert. Siehe [Keycloak & SSO](keycloak.md) fuer Details.

### Mattermost (Chat)

**Für Mitarbeiter:** Mattermost ist der Team-Chat. Hier kommunizierst Du mit Kollegen in Kanälen (themenbasierte Gruppen) oder per Direktnachricht. Du kannst Dateien teilen, auf Nachrichten reagieren und den Billing-Bot per `/billing`-Befehl nutzen.

| Eigenschaft | Wert |
|-------------|------|
| Image | `mattermost/mattermost-enterprise-edition:release-11.5` |
| Port | 8065 |
| URL | http://chat.localhost |
| Datenbank | PostgreSQL (shared-db/mattermost) |
| Storage | 20 Gi PVC (Dateien) |
| Resources | 250m--1 CPU, 256Mi--1Gi RAM |
| Manifest | `k3d/mattermost.yaml` |

Team-Chat mit Channels, DMs, Threads, Webhooks, Slash-Commands. OpenSearch-Integration fuer Volltextsuche. OIDC-Login ueber mm-keycloak-proxy. Konfiguriert mit deutscher Sprache und Europe/Berlin Zeitzone.

**Zugehoerige Manifeste:**
- `k3d/mattermost-hpa.yaml` -- Horizontal Pod Autoscaler
- `k3d/mm-keycloak-proxy.yaml` -- Nginx-Proxy fuer interne Keycloak-Kommunikation

### Nextcloud (Dateien + Talk)

**Für Mitarbeiter:** Nextcloud ist Dein interner Cloud-Speicher. Hier lädst Du Dateien hoch, teilst Ordner mit Kollegen, führst Kalender und startest Videokonferenzen (über Nextcloud Talk). Dokumente lassen sich direkt im Browser bearbeiten.

| Eigenschaft | Wert |
|-------------|------|
| Image | `nextcloud:33-apache` |
| Port | 80 |
| URL | http://files.localhost |
| Datenbank | PostgreSQL (shared-db/nextcloud) |
| Storage | 2 Gi (App) + 50 Gi (Daten) |
| Resources | 200m CPU, 256Mi--1Gi RAM |
| Manifest | `k3d/nextcloud.yaml` |

Dateiverwaltung mit Kalender, Kontakte, Talk (Video), Collabora-Integration. OIDC ueber `nextcloud-oidc-dev.php` ConfigMap. Apps werden nach Deploy per `task workspace:post-setup` aktiviert:
- calendar, contacts, oidc_login, richdocuments, spreed

### Collabora Online (Office)

**Für Mitarbeiter:** Collabora ist das integrierte Büroprogramm. Du kannst Word-, Excel- und PowerPoint-Dateien direkt im Browser öffnen und bearbeiten – ohne zusätzliche Software. Mehrere Personen können gleichzeitig am selben Dokument arbeiten. Collabora öffnet sich automatisch aus Nextcloud heraus, Du musst es nicht separat aufrufen.

| Eigenschaft | Wert |
|-------------|------|
| Image | `collabora/code:25.04.9.4.1` |
| Port | 9980 |
| URL | http://office.localhost (antwortet mit "OK" — kein eigenstaendiges UI) |
| Resources | 200m CPU, 256Mi--1Gi RAM |
| Manifest | `k3d/collabora.yaml` |

LibreOffice-basiertes Online-Office. Verbunden mit Nextcloud ueber WOPI — Dokumente werden direkt aus Nextcloud heraus geoeffnet, nicht ueber die Collabora-URL. Woerterbuecher: Deutsch + Englisch.

### Talk HPB (Signaling)

**Für Mitarbeiter:** Dieser Dienst arbeitet unsichtbar im Hintergrund und sorgt dafür, dass Videokonferenzen in Nextcloud Talk stabil funktionieren. Du interagierst nicht direkt damit – er wird automatisch genutzt, wenn Du einen Videoanruf startest.

Drei Deployments fuer WebRTC-Videokonferenzen:

| Komponente | Image | Port |
|------------|-------|------|
| spreed-signaling | `strukturag/nextcloud-spreed-signaling:2.1.1` | 8080 |
| Janus Gateway | `canyan/janus-gateway:master` | 8188 |
| NATS | `nats:2.10-alpine` | 4222 |
| coturn | `coturn/coturn:4.6-alpine` | 3478 |

**Manifest:** `k3d/talk-hpb.yaml` (signaling + Janus + NATS), `k3d/coturn.yaml`

Janus konfiguriert mit STUN/TURN ueber coturn. RTP-Port-Range: 20000--40000. Alle Konfigurationen ueber ConfigMaps inline im Manifest.

## AI & Suche

### Claude Code (KI-Assistent)

**Für Mitarbeiter:** Claude ist Dein interner KI-Assistent. Du kannst ihm Fragen stellen, Texte schreiben lassen, Zusammenfassungen anfordern oder Dir bei Aufgaben helfen lassen. Zugriff über die KI-Seite in Deinem Browser. Gib keine sensiblen Kundendaten in die KI ein.

Claude Code ist ein lokaler KI-Client (CLI/Desktop/IDE), der ueber MCP-Server (Model Context Protocol) mit dem Kubernetes-Cluster interagiert. Es gibt kein Web-UI im Cluster -- stattdessen zeigt `ai.localhost` eine MCP-Status-Seite mit Health-Checks aller MCP-Server.

| Eigenschaft | Wert |
|-------------|------|
| Status-Seite | http://ai.localhost (MCP-Status-Dashboard) |
| MCP-Server | 11 Server in separaten Pods |
| Backend | Anthropic API (Claude Sonnet 4) |
| Manifest | `k3d/claude-code-config.yaml`, `k3d/claude-code-rbac.yaml` |

**MCP-Server (k3d/):**

| Pod / Manifest | Container | Funktion |
|----------------|-----------|----------|
| `claude-code-mcp-ops.yaml` | mcp-kubernetes, mcp-postgres, mcp-mattermost | Cluster-Management, DB-Abfragen, Chat-Integration |
| `claude-code-mcp-browser.yaml` | mcp-browser | Playwright Browser-Automatisierung |
| `claude-code-mcp-apps.yaml` | mcp-nextcloud, mcp-invoiceninja | Dateien/Kalender, Rechnungen |
| `claude-code-mcp-auth.yaml` | mcp-keycloak | Benutzer-/Rollenverwaltung |
| `claude-code-mcp-github.yaml` | mcp-github | GitHub Repos, Issues, PRs (PAT erforderlich) |
| `claude-code-mcp-stripe.yaml` | mcp-stripe | Zahlungen, Abonnements |
| `claude-code-mcp-grafana.yaml` | mcp-grafana | Grafana Dashboards und Metriken |
| `claude-code-mcp-prometheus.yaml` | mcp-prometheus | PromQL-Abfragen, Cluster-Metriken |
| `claude-code-mcp-kubernetes.yaml` | mcp-kubernetes (standalone) | Dedizierter Read-Only Kubernetes-MCP |
| `claude-code-mcp-postgres.yaml` | mcp-postgres (standalone) | Dedizierter Datenbank-MCP |
| `claude-code-mcp-mattermost.yaml` | mcp-mattermost (standalone) | Dedizierter Mattermost-MCP |

**Produktion (deploy/mcp/):**
- `mcp-status.yaml` -- Health-Dashboard (nginx + healthcheck sidecar)
- `mcp-auth-proxy.yaml` -- ForwardAuth-Proxy fuer Token-Validierung (RBAC)
- Konsolidierte Pods: `claude-code-mcp-core.yaml`, `claude-code-mcp-apps.yaml`, `claude-code-mcp-auth.yaml`

**Zugehoerige Manifeste:**
- `k3d/claude-code-config.yaml` -- Umgebungskonfiguration (MCP-URLs, API-Keys)
- `k3d/claude-code-rbac.yaml` -- Kubernetes RBAC fuer MCP-Zugriff (ClusterRole + ServiceAccount)
- `claude-code/system-prompt.md` -- System-Prompt fuer Claude Code
- `claude-code/cluster.settings.json` -- MCP-Konfiguration fuer Cluster-Admin-Rolle
- `claude-code/business.settings.json` -- MCP-Konfiguration fuer Business-Benutzer-Rolle

### OpenSearch (Volltextsuche)

**Für Mitarbeiter:** OpenSearch arbeitet unsichtbar im Hintergrund und ermöglicht die Volltextsuche in Mattermost. Wenn Du in Mattermost nach einem Begriff suchst, liefert OpenSearch die Ergebnisse. Du interagierst nicht direkt damit.

| Eigenschaft | Wert |
|-------------|------|
| Image | `opensearchproject/opensearch:2.19.5` |
| Ports | 9200 (HTTP), 9600 (Telemetrie) |
| Storage | 5 Gi PVC |
| Resources | 200m CPU, 512Mi--1Gi RAM |
| Manifest | `k3d/opensearch.yaml` |

Single-Node Cluster fuer Mattermost-Volltextsuche. Security-Plugin deaktiviert (Dev). JVM Heap: 256m.

### Whisper (Transkription, optional)

**Für Mitarbeiter:** Whisper wandelt gesprochene Sprache automatisch in Text um (Spracherkennung). Dieser Dienst ist optional und wird nicht standardmäßig aktiviert.

| Eigenschaft | Wert |
|-------------|------|
| Image | `fedirz/faster-whisper-server:latest-cpu` |
| Port | 8000 |
| Resources | 1--4 CPU, 2--4Gi RAM |
| Manifest | `k3d/whisper.yaml` |

CPU-basierte Spracherkennung mit dem Medium-Modell. GPU-Variante: `k3d/whisper-gpu.yaml`. Deploy: `task whisper:deploy`.

### Embedding (Text-Vektorisierung)

| Eigenschaft | Wert |
|-------------|------|
| Image | `michaelf34/infinity:0.0.70` (infinity-emb) |
| Port | 8080 |
| Modell | BAAI/bge-base-en-v1.5 (768 Dimensionen) |
| API | OpenAI-kompatibel (POST /embeddings) |
| Manifest | `k3d/embedding.yaml` |

CPU-basierte Text-Vektorisierung fuer Meeting-Transkript-Analyse. Wird intern von der Website fuer Meeting Insights genutzt.

### Talk Recording (Anruf-Aufzeichnung)

| Eigenschaft | Wert |
|-------------|------|
| Image | `nextcloud/aio-talk-recording` |
| Port | 1234 |
| Manifest | `k3d/talk-recording.yaml` |

Firefox/geckodriver-basierter Aufzeichnungsservice fuer Nextcloud Talk. Tritt Anrufen ueber spreed-signaling bei und zeichnet Audio/Video auf. Aufnahmen werden im Nextcloud-Dateiverzeichnis des Anruf-Erstellers gespeichert.

### Talk Transcriber (Live-Transkription)

**Für Mitarbeiter:** Der Talk Transcriber transkribiert laufende Nextcloud-Talk-Videokonferenzen in Echtzeit und stellt das Transkript als Textdatei bereit.

| Eigenschaft | Wert |
|-------------|------|
| Image | `ghcr.io/paddione/talk-transcriber:latest` |
| Port | intern |
| Resources | nach Konfiguration |
| Manifest | `k3d/talk-transcriber.yaml` |

Verbindet sich mit dem spreed-signaling-Server, nimmt am Anruf teil und uebertraegt Audio an den Whisper-Dienst zur Transkription.

## Business-Services

### Invoice Ninja (Rechnungen)

**Für Mitarbeiter:** Invoice Ninja ist das Rechnungsprogramm. Hier erstellst Du Rechnungen, verwaltets Kunden und verfolgst Zahlungen. Du kannst auch direkt aus dem Chat (Mattermost) per `/billing invoice Kundenname` eine Rechnung erstellen lassen.

| Eigenschaft | Wert |
|-------------|------|
| Image | `invoiceninja/invoiceninja:5` + `nginx:1.27-alpine` (Sidecar) |
| Port | 9000 (FPM) / 80 (Nginx) |
| URL | http://billing.localhost (ueber oauth2-proxy) |
| Datenbank | MariaDB 11 (eigene Instanz) |
| Storage | 5 Gi (App) + 5 Gi (MariaDB) |
| Manifest | `k3d/invoiceninja.yaml` |

Rechnungserstellung mit Stripe-Integration. Zugriff ueber oauth2-proxy fuer Keycloak-SSO. Nginx-Sidecar serviert statische Dateien.

**Zugehoerige Manifeste:**
- `k3d/oauth2-proxy-invoiceninja.yaml` -- OAuth2-Proxy (quay.io/oauth2-proxy/oauth2-proxy:v7.9.0)
- `k3d/billing-bot.yaml` -- Go-Bot fuer Mattermost-Integration
- `k3d/billing-bot-init-job.yaml` -- Automatische Token/Slash-Command-Provisionierung

### billing-bot

**Für Mitarbeiter:** Der Billing-Bot ist ein automatischer Helfer im Chat. Wenn Du in Mattermost `/billing` eingibst, erledigt er Aufgaben wie das Erstellen von Rechnungen für Dich – ohne dass Du die Rechnungssoftware separat öffnen musst.

| Eigenschaft | Wert |
|-------------|------|
| Image | `registry.localhost:5000/billing-bot:v1` |
| Port | 8090 |
| Resources | 50m CPU, 32--64Mi RAM |
| Manifest | `k3d/billing-bot.yaml` |

Go-Microservice: `/slash` (Slash-Command Handler), `/actions` (Interactive Messages), `/healthz`. Verbindet Mattermost mit Invoice Ninja.

### Vaultwarden (Passwoerter)

**Für Mitarbeiter:** Vaultwarden ist der sichere Passwort-Safe des Teams. Hier speicherst Du Zugangsdaten und kannst sie sicher mit Kollegen teilen – alles verschlüsselt auf Deinen eigenen Servern. Du kannst auch das Bitwarden-Browser-Plugin nutzen, um Passwörter automatisch ausfüllen zu lassen. Achtung: Du benötigst ein eigenes Master-Passwort, das Du Dir gut merken musst.

| Eigenschaft | Wert |
|-------------|------|
| Image | `vaultwarden/server:1.35.3-alpine` |
| Port | 80 |
| URL | http://vault.localhost |
| Datenbank | PostgreSQL (shared-db/vaultwarden) |
| Storage | 5 Gi PVC |
| Resources | 50m CPU, 64--256Mi RAM |
| Manifest | `k3d/vaultwarden.yaml` |

Bitwarden-kompatibler Passwort-Manager mit SSO-Login ueber Keycloak. Seed-Job fuer initiale Ordnerstruktur: `task workspace:vaultwarden:seed`.

## Kollaboration

### Whiteboard

**Für Mitarbeiter:** Das digitale Whiteboard dient zum gemeinsamen Skizzieren, Brainstormen und Visualisieren – wie ein echtes Whiteboard in einem Besprechungsraum, nur online. Mehrere Personen können gleichzeitig zeichnen und schreiben.

| Eigenschaft | Wert |
|-------------|------|
| Image | `ghcr.io/nextcloud-releases/whiteboard:v1.5.7` |
| Port | 3002 |
| URL | http://board.localhost |
| Resources | 100m CPU, 128--256Mi RAM |
| Manifest | `k3d/whiteboard.yaml` |

Nextcloud-integriertes kollaboratives Whiteboard mit JWT-Authentifizierung.

### Outline (Wiki, optional)

**Für Mitarbeiter:** Outline ist die interne Wissensdatenbank des Teams. Hier hältst Du Anleitungen, Prozesse und wichtiges Wissen schriftlich fest – so dass Kollegen es jederzeit nachlesen können. Inhalte lassen sich gemeinsam bearbeiten und sind über eine Volltextsuche leicht auffindbar.

| Eigenschaft | Wert |
|-------------|------|
| Image | `outlinewiki/outline:1.6.1` + `redis:7-alpine` (Sidecar) |
| Port | 3000 |
| URL | http://wiki.localhost |
| Datenbank | PostgreSQL (shared-db/outline) |
| Storage | 5 Gi PVC (Dateien) |
| Resources | 100m CPU, 256--512Mi RAM |
| Manifest | `k3d/outline.yaml` |

Wissensdatenbank mit Keycloak-OIDC. Redis-Sidecar fuer Caching. Deploy: `task outline:deploy`.

## Infrastruktur-Services

### shared-db (PostgreSQL + pgvector)

| Eigenschaft | Wert |
|-------------|------|
| Image | `pgvector/pgvector:0.8.0-pg16` |
| Port | 5432 |
| Storage | 25 Gi PVC |
| Resources | 100m CPU, 256Mi RAM |
| Manifest | `k3d/shared-db.yaml` |

Gemeinsame PostgreSQL-16-Instanz mit pgvector-Erweiterung fuer alle Services. Beherbergt separate Datenbanken und User fuer keycloak, mattermost, nextcloud, vaultwarden und outline. pgvector ermoeglicht Vektorsuche fuer KI-Features (z. B. Embedding-Auswertungen). Zugriff per `task workspace:psql -- <db>` oder Port-Forward via `task workspace:port-forward`.

### Mailpit (Dev-Mail)

**Für Mitarbeiter:** Mailpit wird nur in der Entwicklungsumgebung verwendet und ist kein normaler E-Mail-Dienst. Es fängt alle ausgehenden E-Mails ab, damit sie nicht versehentlich echte Empfänger erreichen. In der Produktivumgebung wird ein normaler E-Mail-Server eingesetzt.

| Eigenschaft | Wert |
|-------------|------|
| Image | `axllent/mailpit:v1.29` |
| Ports | 1025 (SMTP), 8025 (Web UI) |
| URL | http://mail.localhost |
| Resources | 25m CPU, 32--128Mi RAM |
| Manifest | `k3d/mailpit.yaml` |

SMTP-Server fuer Entwicklung. Alle Services senden E-Mails an Mailpit.

### Docs (Docsify)

| Eigenschaft | Wert |
|-------------|------|
| Image | `joseluisq/static-web-server:2.36-alpine` |
| Port | 80 |
| URL | http://docs.localhost (SSO-geschuetzt) |
| Resources | 10m CPU, 16--64Mi RAM |
| Manifest | `k3d/docs.yaml` |

Static-Web-Server serviert die Docsify-Dokumentation aus einem Kubernetes ConfigMap. Kein Git-Sync -- Inhalte sind direkt im ConfigMap eingebettet. Zugriff ist per Keycloak-Login geschuetzt (oauth2-proxy-docs vorgelagert).

### oauth2-proxy-docs (Docs SSO-Gateway)

| Eigenschaft | Wert |
|-------------|------|
| Image | `quay.io/oauth2-proxy/oauth2-proxy:v7.9.0` |
| Port | 4180 |
| Upstream | `http://docs:80` |
| Resources | 50m CPU, 64--128Mi RAM |
| Manifest | `k3d/oauth2-proxy-docs.yaml` |

Keycloak-OIDC-Proxy vor dem Docs-Dienst. Entspricht dem gleichen Muster wie `oauth2-proxy-invoiceninja`. Benutzer werden zur Keycloak-Anmeldeseite weitergeleitet; nach erfolgreicher Authentifizierung wird die Anfrage an `docs:80` weitergeleitet.

### Website (Astro + Svelte)

**Für Mitarbeiter:** Die öffentliche Unternehmenswebsite, die Besucher von außen sehen. Das Kontaktformular leitet Anfragen automatisch in den Mattermost-Chat weiter. Auf der Leistungen-Seite kann direkt per Stripe bezahlt werden.

| Eigenschaft | Wert |
|-------------|------|
| URL | http://web.localhost |
| Namespace | `website` (eigener Namespace) |
| Manifest | `k3d/website.yaml` |
| Datenbank | PostgreSQL (shared-db/website) |
| Deploy | `task website:deploy` |

Multi-Brand-Unternehmenswebsite (mentolder / korczewski) mit:
- **Kontaktformular** — leitet Anfragen via Mattermost-Webhook in den Chat
- **Leistungen-Seite** — Preistabelle mit Stripe-Checkout (direkter Kauf ohne Invoice Ninja)
- **Homepage-CTA** — Stripe-Checkout-Button fuer das Haupt-Angebot
- **OIDC-Login** — Keycloak SSO fuer Kunden und Administratoren
- **Admin-Panel** (`/admin`) — Brand-Konfiguration: Services, Leistungen, Site-Einstellungen, Rechtstexte, Referenzen
- **Projektmanagement** (`/admin/projekte`) — Projekte, Teilprojekte und Aufgaben je Kunde; Gantt-Diagramm
- **Bug-Reporting** — Formular mit Ticket-Tracking in der `website`-Datenbank

Stripe-Keys werden als Kubernetes Secret injiziert. Setup: `task workspace:stripe-setup`. Siehe [Stripe-Integration](stripe.md).
Admin: Siehe [Projektmanagement-Admin](admin-projekte.md).

## Ressourcen-Uebersicht

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': {'background': '#1a2235', 'mainBkg': '#1a2235', 'pie1': '#374151', 'pie2': '#1d5c3a', 'pie3': '#1d5c3a', 'pie4': '#2563a0', 'pie5': '#4c2d8a', 'pie6': '#374151', 'pie7': '#1d5c3a', 'pie8': '#7a3c00', 'pie9': '#0b5575', 'pie10': '#374151', 'pie11': '#1a1a2e', 'pieTextColor': '#e8e8f0', 'pieLegendTextColor': '#e8e8f0', 'pieLabelTextColor': '#e8e8f0'}}}%%
pie title RAM Requests (Gesamt ca. 3.5 Gi)
    "PostgreSQL (256 Mi)" : 256
    "Mattermost (256 Mi)" : 256
    "Nextcloud (256 Mi)" : 256
    "Keycloak (512 Mi)" : 512
    "Claude Code (256 Mi)" : 256
    "OpenSearch (512 Mi)" : 512
    "Collabora (256 Mi)" : 256
    "Invoice Ninja + MariaDB (416 Mi)" : 416
    "Talk HPB Stack (256 Mi)" : 256
    "Embedding (256 Mi)" : 256
    "Sonstige (288 Mi)" : 288
```
