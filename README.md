# Workspace MVP

Kubernetes-basierte Kollaborationsplattform fuer kleine Teams -- Mattermost (Chat), Nextcloud (Dateien + Talk Video + Collabora Office), Keycloak (SSO), OpenClaw (KI), Invoice Ninja (Rechnungen) und weitere Services auf k3d/k3s mit Traefik Ingress.

## Schnellstart

Voraussetzungen: Docker, [k3d](https://k3d.io), kubectl, [task](https://taskfile.dev)

```bash
git clone https://github.com/Paddione/Bachelorprojekt.git && cd Bachelorprojekt

# Cluster erstellen + alle Services deployen
task cluster:create && task workspace:deploy
```

Oder alles auf einmal (Cluster + MVP + MCP + Monitoring + Billing):

```bash
task workspace:up
```

## Service-Endpunkte

| Service | URL | Beschreibung |
|---------|-----|--------------|
| Keycloak (SSO) | http://auth.localhost | Identity Provider (admin / devadmin) |
| Mattermost (Chat) | http://chat.localhost | Team-Chat |
| Nextcloud (Dateien + Talk) | http://files.localhost | Dateien, Kalender, Kontakte, Video |
| Collabora (Office) | http://office.localhost | Online-Office (LibreOffice) |
| Talk HPB (Signaling) | http://signaling.localhost | WebRTC-Signaling (Janus + NATS + coturn) |
| OpenClaw (KI) | http://ai.localhost | Self-hosted AI (Ollama + Anthropic API) |
| Invoice Ninja (Rechnungen) | http://billing.localhost | Rechnungsstellung |
| Vaultwarden (Passwoerter) | http://vault.localhost | Passwort-Manager (Bitwarden-kompatibel) |
| Whiteboard | http://board.localhost | Kollaboratives Whiteboard |
| Mailpit (Dev-Mail) | http://mail.localhost | E-Mail-Testing (nur Dev) |
| OpenSearch | -- | Volltextsuche (intern) |
| Docs | http://docs.localhost | Projektdokumentation (Docsify) |
| Website | http://web.localhost | Astro + Svelte Webseite |
| Outline (Wiki) | http://wiki.localhost | Wissensdatenbank (optional) |
| Whisper | -- | Transkriptions-Service (intern, optional) |

## Dokumentation

| Dokument | Beschreibung |
|----------|-------------|
| [Architektur](http://docs.localhost/architecture) | Systemuebersicht, Service-Diagramm, Netzwerk und Datenfluss |
| [Services](http://docs.localhost/services) | Kubernetes-Services und deren Zusammenspiel |
| [Keycloak & SSO](http://docs.localhost/keycloak) | Identity Management, OIDC-Clients |
| [Migration](http://docs.localhost/migration) | Import von Slack, Teams, Google Workspace |
| [Skripte](http://docs.localhost/scripts) | Referenz aller Skripte, Parameter und Befehle |
| [Tests](http://docs.localhost/tests) | Automatisiertes Test-Framework |
| [Sicherheit](http://docs.localhost/security) | Sicherheitsrichtlinien und Best Practices |
| [Fehlerbehebung](http://docs.localhost/troubleshooting) | Haeufige Probleme und Loesungsansaetze |
| [Anforderungen](docs/README.md) | Maschinenlesbare Anforderungsdefinitionen (JSON) |

## Architektur

```mermaid
graph TB
    subgraph Internet
        User([Benutzer / Browser])
    end

    subgraph k3d-Cluster ["k3d/k3s Cluster"]
        Traefik["Traefik Ingress<br/>Ports 80 / 443"]

        subgraph workspace ["Namespace: workspace"]
            KC[Keycloak<br/>auth.localhost]
            MM[Mattermost<br/>chat.localhost]
            NC[Nextcloud + Talk<br/>files.localhost]
            CO[Collabora Online<br/>office.localhost]
            HPB[Talk HPB Signaling<br/>signaling.localhost]
            OC[OpenClaw AI<br/>ai.localhost]
            IN[Invoice Ninja<br/>billing.localhost]
            VW[Vaultwarden<br/>vault.localhost]
            WB[Whiteboard<br/>board.localhost]
            MP[Mailpit<br/>mail.localhost]
            OS[OpenSearch]
            DOCS[Docs<br/>docs.localhost]
            BB[billing-bot<br/>intern]
            PROXY[mm-keycloak-proxy<br/>intern]
            OAUTH[oauth2-proxy<br/>Invoice Ninja]

            subgraph HPB-Stack ["Talk HPB Stack"]
                JANUS[Janus Gateway]
                NATS[NATS]
                COTURN[coturn TURN/STUN]
            end

            DB[(PostgreSQL 16<br/>shared-db)]
        end

        subgraph website-ns ["Namespace: website"]
            WEB[Website Astro<br/>web.localhost]
        end

        subgraph monitoring-ns ["Namespace: monitoring"]
            PROM[Prometheus]
            GRAF[Grafana]
        end
    end

    User --> Traefik
    Traefik --> KC & MM & NC & CO & HPB & OC & IN & VW & WB & MP & DOCS & WEB

    KC -. OIDC .-> MM & NC & IN & OC
    PROXY --> KC
    MM --> PROXY
    OAUTH --> KC
    IN --> OAUTH

    MM <--> BB
    BB <--> IN

    NC --> CO
    NC --> HPB
    HPB --- JANUS & NATS
    JANUS --- COTURN

    KC & MM & NC & IN & OC & OS --> DB
    PROM --> GRAF
```

### SSO-Ablauf (OIDC)

```mermaid
sequenceDiagram
    participant U as Benutzer
    participant S as Service<br/>(Mattermost / Nextcloud / etc.)
    participant KC as Keycloak
    participant DB as PostgreSQL

    U->>S: Zugriff auf geschuetzte Seite
    S->>KC: Redirect zu /auth (OIDC Authorization Request)
    KC->>U: Login-Formular
    U->>KC: Credentials eingeben
    KC->>DB: Credentials pruefen
    DB-->>KC: OK
    KC->>U: Redirect zurueck mit Authorization Code
    U->>S: Authorization Code
    S->>KC: Token-Austausch (Code -> Access Token + ID Token)
    KC-->>S: Tokens
    S->>S: Benutzer anlegen / Session erstellen
    S-->>U: Zugriff gewaehrt
```

### Deployment-Ablauf

```mermaid
flowchart LR
    A[task cluster:create] --> B[task workspace:deploy]
    B --> C{Optionale Schritte}
    C --> D[task mcp:deploy<br/>MCP-Server]
    C --> E[task workspace:monitoring<br/>Prometheus + Grafana]
    C --> F[task workspace:post-setup<br/>Nextcloud Apps]
    C --> G[task workspace:billing-setup<br/>billing-bot Image]
    C --> H[task workspace:stripe-setup<br/>Stripe Gateway]
    C --> I[task workspace:vaultwarden:seed<br/>Secret-Templates]

    style A fill:#2d6a4f,color:#fff
    style B fill:#2d6a4f,color:#fff
```

Alternativ alles automatisch: `task workspace:up`

## Vollstaendige Task-Referenz

### Cluster-Lifecycle

| Befehl | Beschreibung |
|--------|-------------|
| `task cluster:create` | k3d-Cluster mit lokaler Registry erstellen |
| `task cluster:delete` | Cluster zerstoeren (mit Bestaetigung) |
| `task cluster:start` | Gestoppten Cluster starten |
| `task cluster:stop` | Cluster stoppen (Zustand bleibt erhalten) |
| `task cluster:status` | Cluster-Status, Nodes und Ressourcenverbrauch |
| `task namespaces:create` | Standard-Namespaces mit Pod Security Standards |

### Workspace MVP

| Befehl | Beschreibung |
|--------|-------------|
| `task workspace:up` | Vollautomatisch: Cluster + MVP + MCP + Monitoring + Billing |
| `task workspace:deploy` | Alle Workspace-Services deployen |
| `task workspace:status` | Pod-Status, Services, Ingress, PVCs anzeigen |
| `task workspace:logs -- <svc>` | Logs eines Service ansehen |
| `task workspace:restart -- <svc>` | Service neu starten |
| `task workspace:validate` | Manifeste per Dry-Run validieren |
| `task workspace:teardown` | Workspace-Namespace loeschen (mit Bestaetigung) |
| `task workspace:post-setup` | Nextcloud-Apps aktivieren (Kalender, Kontakte, OIDC, Collabora) |
| `task workspace:psql -- <db>` | psql-Shell zur shared-db oeffnen |
| `task workspace:port-forward` | shared-db auf localhost:5432 weiterleiten |
| `task workspace:dsgvo-check` | DSGVO-Compliance-Pruefung ausfuehren |
| `task workspace:monitoring` | Prometheus + Grafana + DSGVO-Dashboard installieren |
| `task workspace:prod:deploy` | Produktions-Deployment auf k3s-production |

### Billing & Invoice Ninja

| Befehl | Beschreibung |
|--------|-------------|
| `task workspace:billing-build` | billing-bot Docker-Image bauen und pushen |
| `task workspace:billing-setup` | billing-bot Image bauen (Token + Slash-Command automatisch) |
| `task workspace:stripe-setup` | Stripe als Payment Gateway in Invoice Ninja registrieren |

### OpenClaw & MCP-Server

| Befehl | Beschreibung |
|--------|-------------|
| `task workspace:openclaw:setup` | MCP-Server in OpenClaw-Datenbank registrieren |
| `task mcp:deploy` | Alle OpenClaw MCP-Pods deployen (core + apps + auth) |
| `task mcp:status` | Status aller MCP-Pods und Container |
| `task mcp:logs -- <pod>/<container>` | MCP-Container-Logs ansehen |
| `task mcp:restart -- core\|apps\|auth` | MCP-Pod neu starten |
| `task mcp:select` | Interaktiver MCP-Server-Selektor |
| `task mcp:mattermost-setup` | OpenClaw-Channels in Mattermost erstellen |
| `task mcp:set-github-pat -- <token>` | GitHub PAT in openclaw-secrets aktualisieren |

### Vaultwarden

| Befehl | Beschreibung |
|--------|-------------|
| `task workspace:vaultwarden:seed` | Vaultwarden mit Produktions-Secret-Templates befuellen |
| `task workspace:vaultwarden:seed-logs` | Logs des letzten Seed-Jobs anzeigen |

### Website (Astro + Svelte)

| Befehl | Beschreibung |
|--------|-------------|
| `task website:build` | Astro-Website Docker-Image bauen |
| `task website:build:import` | Image bauen und in k3d importieren |
| `task website:deploy` | Website in den website-Namespace deployen |
| `task website:dev` | Astro Dev-Server lokal starten (Hot-Reload) |
| `task website:status` | Website Deployment-Status |
| `task website:logs` | Website-Logs |
| `task website:restart` | Website-Pod neu starten |
| `task website:redeploy` | Image neu bauen, importieren und neu starten |
| `task website:teardown` | Website-Namespace loeschen (mit Bestaetigung) |
| `task website:webhook:setup` | Mattermost-Webhook fuer Kontaktformular einrichten |

### Whisper (Transkription, optional)

| Befehl | Beschreibung |
|--------|-------------|
| `task whisper:deploy` | faster-whisper Transkriptions-Service deployen |
| `task whisper:status` | Whisper Deployment-Status |
| `task whisper:logs` | Whisper-Logs |

### Outline (Wiki, optional)

| Befehl | Beschreibung |
|--------|-------------|
| `task outline:deploy` | Outline Wissensdatenbank deployen |
| `task outline:status` | Outline Deployment-Status |
| `task outline:logs` | Outline-Logs |
| `task outline:teardown` | Outline und Daten entfernen (mit Bestaetigung) |

### Dokumentation

| Befehl | Beschreibung |
|--------|-------------|
| `task docs:deploy` | Docsify Docs-Site deployen (git-sync) |
| `task docs:restart` | Docs-Pod fuer neueste Inhalte neu starten |
| `task docs:integrate-mattermost` | Docs in Mattermost integrieren (Bookmark + Slash-Command) |
| `task docs:publish-api` | OpenAPI-Spec zu GitBook veroeffentlichen |

### Observability

| Befehl | Beschreibung |
|--------|-------------|
| `task observability:install` | Prometheus + Grafana Stack installieren |
| `task observability:remove` | Observability Stack entfernen |

### TLS & DNS (Produktion)

| Befehl | Beschreibung |
|--------|-------------|
| `task cert:install` | cert-manager + lego DNS-01 Webhook installieren |
| `task cert:secret -- <key>` | ipv64 API-Key als Secret speichern |
| `task cert:status` | Wildcard-Zertifikat und ClusterIssuer Status |
| `task ddns:deploy -- <key>` | DDNS-Updater CronJob deployen (dynamische IP) |
| `task ddns:trigger` | DDNS-Update manuell ausloesen |
| `task ddns:status` | DDNS-Status und letzte bekannte IP |
| `task ddns:teardown` | DDNS-Updater entfernen |

### Konfiguration

| Befehl | Beschreibung |
|--------|-------------|
| `task domain:set -- <domain>` | Produktions-Domain in .env aendern |
| `task brand:set -- <name>` | Branding-Name in .env aendern |
| `task email:set -- <email>` | Kontakt-E-Mail in .env aendern |
| `task config:show` | Aktuelle Konfigurationsvariablen anzeigen |

### Build, Deploy & Dev (Demo-App)

| Befehl | Beschreibung |
|--------|-------------|
| `task build` | Demo-App Image bauen und in lokale Registry pushen |
| `task build:import` | Demo-App Image direkt in k3d importieren |
| `task deploy` | Demo-App per Kustomize deployen |
| `task deploy:status` | Demo-App Deployment-Status |
| `task dev` | Skaffold Dev-Modus (Auto-Rebuild + Hot-Reload) |
| `task dev:run` | Einmaliger Build + Deploy via Skaffold |

### Utilities

| Befehl | Beschreibung |
|--------|-------------|
| `task up` | Schnellstart: Cluster + Build + Deploy (Demo-App) |
| `task down` | Cluster zerstoeren |
| `task ingress:status` | Traefik Ingress-Controller Status |
| `task hooks:install` | Git-Hooks installieren (Branch-Naming, Validierung, Secret-Scan) |
| `task registry:list` | Images in der lokalen Registry auflisten |
| `task logs` | Logs der Demo-App ansehen |
| `task shell` | Debug-Shell im Cluster oeffnen |
| `task clean` | Vollstaendige Bereinigung (Cluster + Docker Prune) |

## Tests

```bash
./tests/runner.sh local              # Alle Tests gegen k3d
./tests/runner.sh local SA-08        # Einzelnen Test ausfuehren
./tests/runner.sh local --verbose    # Ausfuehrliche Ausgabe
./tests/runner.sh report             # Markdown-Report generieren
```

Test-IDs: `FA-01`--`FA-11` (funktional), `SA-01`--`SA-09` (Sicherheit), `NFA-01`--`NFA-07` (nicht-funktional), `AK-03`, `AK-04` (Abnahme).

## Projektstruktur

```
Bachelorprojekt/
  k3d/                          # Kubernetes-Manifeste (Kustomize) -- einziger Deployment-Pfad
    kustomization.yaml          # Kustomize-Orchestrierung
    configmap-domains.yaml      # Zentrale Domain-Konfiguration
    secrets.yaml                # Dev-Secrets (keine echten Credentials!)
    ingress.yaml                # Traefik Ingress Rules
    keycloak.yaml               # Keycloak + Realm-Import
    mattermost.yaml             # Mattermost + HPA
    nextcloud.yaml              # Nextcloud + Talk
    collabora.yaml              # Collabora Online
    talk-hpb.yaml               # Talk HPB (Signaling + Janus + NATS)
    coturn.yaml                 # TURN/STUN Server
    openclaw-webui.yaml         # OpenClaw AI WebUI
    openclaw-config.yaml        # OpenClaw Konfiguration
    openclaw-mcp-*.yaml         # MCP-Server Manifeste (7 Server)
    invoiceninja.yaml           # Invoice Ninja + OAuth2-Proxy
    billing-bot.yaml            # billing-bot Deployment
    vaultwarden.yaml            # Vaultwarden Passwort-Manager
    whiteboard.yaml             # Kollaboratives Whiteboard
    opensearch.yaml             # Volltextsuche
    mailpit.yaml                # Dev-Mailserver
    whisper.yaml                # Transkriptions-Service
    outline.yaml                # Outline Wiki
    docs.yaml                   # Docsify Docs-Site
    website.yaml                # Astro Website
    shared-db.yaml              # PostgreSQL 16 (eine DB pro Service)
    realm-workspace-dev.json    # Keycloak Realm-Konfiguration
    nextcloud-oidc-dev.php      # Nextcloud OIDC-Konfiguration
  prod/                         # Produktions-Overlays (TLS, Ressourcen-Limits, Replicas)
  deploy/                       # Skaffold-basierter Deploy-Pfad (Dev-Iteration)
    mcp/                        # MCP-Server Kustomize Overlays
  billing-bot/                  # Go-Microservice (main.go) -- /slash, /actions, /healthz
  openclaw/                     # OpenClaw Konfiguration + System-Prompt
  scripts/                      # Bash-Utility-Skripte (Migration, Import, DSGVO, MCP)
  tests/                        # Automatisierte Tests (Bash + Playwright)
  website/                      # Astro + Svelte Website
  docs/                         # Anforderungsdefinitionen (JSON)
  docs-site/                    # Docsify index.html
  mattermost/                   # Mattermost Keycloak-Proxy Config
  grafana/                      # DSGVO Compliance Dashboard
```

## Regeln fuer dieses Monorepo

1. **Einziger Deployment-Pfad ist k3d/k3s.** Es gibt keine docker-compose-Konfiguration.
2. **Alle Kubernetes-Manifeste liegen in `k3d/`.** Kustomize ist das Build-Tool.
3. **Aenderungen gehen immer durch Pull Requests** -- keine direkten Pushes auf `main`.
4. **CI muss gruen sein** vor dem Merge (Manifest-Validierung, YAML-Lint, Shellcheck, Security-Scan).
5. **Domain-Konfiguration ist zentral** in `k3d/configmap-domains.yaml`. Keine hartkodierten Hostnamen in Manifesten.
6. **Secrets liegen in `k3d/secrets.yaml`** (nur Dev-Werte). Niemals echte Credentials committen.
7. **Tests laufen gegen den lokalen k3d-Cluster** via `./tests/runner.sh local`.
