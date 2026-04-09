# Architektur

## Systemuebersicht

Workspace MVP ist eine Kubernetes-basierte Kollaborationsplattform fuer kleine Teams. Alle Services laufen als Deployments in einem k3d/k3s Cluster mit Traefik als Ingress Controller. Daten bleiben vollstaendig on-premises (DSGVO by Design).

> **Tipp:** Die Service-Boxen im Diagramm sind klickbar und fuehren zu den Detail-Abschnitten weiter unten.

```mermaid
flowchart TB
    User([fa:fa-user Benutzer / Browser])

    subgraph cluster ["fa:fa-server k3d/k3s Cluster"]
        direction TB
        Traefik{{"fa:fa-globe Traefik Ingress\n80 / 443"}}

        subgraph identity ["fa:fa-shield-halved Identitaet"]
            KC["fa:fa-key Keycloak\nauth.localhost"]
            PROXY["mm-keycloak-proxy"]
            OAUTH["oauth2-proxy"]
        end

        subgraph collaboration ["fa:fa-users Kommunikation & Zusammenarbeit"]
            MM["fa:fa-comments Mattermost\nchat.localhost"]
            NC["fa:fa-cloud Nextcloud + Talk\nfiles.localhost"]
            CO["fa:fa-file-word Collabora Online\noffice.localhost"]
            WB["fa:fa-chalkboard Whiteboard\nboard.localhost"]
            OL["fa:fa-book Outline Wiki\nwiki.localhost"]
        end

        subgraph video ["fa:fa-video Talk HPB Stack"]
            SIG["spreed-signaling\nsignaling.localhost"]
            JANUS["Janus Gateway"]
            NATS["NATS"]
            COTURN["coturn"]
        end

        subgraph ai ["fa:fa-robot KI & Automatisierung"]
            OC["fa:fa-brain Claude Code AI\nai.localhost"]
            MCP_K8S["MCP Kubernetes"]
            MCP_PG["MCP Postgres"]
            MCP_BR["MCP Browser"]
            WHISPER["fa:fa-microphone Whisper"]
        end

        subgraph billing ["fa:fa-file-invoice Abrechnung"]
            IN["fa:fa-receipt Invoice Ninja\nbilling.localhost"]
            BB["billing-bot"]
        end

        subgraph tools ["fa:fa-toolbox Werkzeuge"]
            VW["fa:fa-lock Vaultwarden\nvault.localhost"]
            MP["fa:fa-envelope Mailpit\nmail.localhost"]
            DOCS["fa:fa-file-lines Docs\ndocs.localhost"]
        end

        subgraph data ["fa:fa-database Datenhaltung"]
            DB[("PostgreSQL 16\nshared-db\n5 Datenbanken")]
            MARIA[("MariaDB 11\ninvoiceninja")]
            OS[("OpenSearch\nVolltextsuche")]
            REDIS[("Redis\nOutline Cache")]
        end

        subgraph external ["Weitere Namespaces"]
            WEB["fa:fa-globe Website Astro\nweb.localhost"]
            PROM["fa:fa-chart-line Prometheus"]
            GRAF["fa:fa-gauge Grafana"]
        end
    end

    %% --- Ingress Layer ---
    User --> Traefik
    Traefik --> KC
    Traefik --> MM
    Traefik --> NC
    Traefik --> CO
    Traefik --> SIG
    Traefik --> OC
    Traefik --> OAUTH
    Traefik --> VW
    Traefik --> WB
    Traefik --> MP
    Traefik --> DOCS
    Traefik --> WEB
    Traefik --> OL

    %% --- OIDC (Keycloak als IdP) ---
    KC -. "OIDC" .-> MM
    KC -. "OIDC" .-> NC
    KC -. "OIDC" .-> IN
    KC -. "OIDC" .-> OC
    KC -. "OIDC" .-> VW
    KC -. "OIDC" .-> OL
    KC -. "OIDC" .-> WEB

    %% --- Auth Proxies ---
    MM --> PROXY --> KC
    OAUTH --> KC
    OAUTH --> IN

    %% --- Collaboration ---
    NC --> CO
    NC --> SIG
    SIG --- JANUS
    SIG --- NATS
    JANUS --- COTURN

    %% --- Billing ---
    MM <--> BB <--> IN

    %% --- AI/MCP ---
    OC --> MCP_K8S
    OC --> MCP_PG
    OC --> MCP_BR

    %% --- Search ---
    MM --> OS

    %% --- Datenbanken ---
    KC --> DB
    MM --> DB
    NC --> DB
    VW --> DB
    OC --> DB
    OL --> DB
    IN --> MARIA
    OL --> REDIS

    %% --- Monitoring ---
    PROM -.-> GRAF

    %% --- SMTP ---
    MM -. "SMTP" .-> MP
    NC -. "SMTP" .-> MP
    IN -. "SMTP" .-> MP

    %% --- Klickbare Nodes ---
    click KC "#keycloak" "Keycloak: Zentraler OIDC Identity Provider fuer SSO. Verwaltet Benutzer, Rollen und 7 OIDC-Clients. Speichert Sessions und Realm-Konfiguration in PostgreSQL."
    click MM "#mattermost" "Mattermost: Team-Chat mit Channels, Threads und Dateifreigabe. Integriert OpenSearch fuer Volltextsuche, Webhooks fuer Automatisierung und Slash-Commands fuer billing-bot."
    click NC "#nextcloud" "Nextcloud: Dateiverwaltung, Kalender, Kontakte und Videokonferenzen via Talk. WOPI-Integration mit Collabora fuer Office-Dokumente. WebRTC via HPB Stack."
    click CO "#collabora" "Collabora Online: LibreOffice-basierter Office-Editor im Browser. Bearbeitet DOCX, XLSX, PPTX, ODT Dateien kollaborativ ueber WOPI-Protokoll mit Nextcloud."
    click OC "#claude-code" "Claude Code: KI-Assistent mit Claude Sonnet 4. Nutzt MCP-Server fuer Kubernetes-Verwaltung, Datenbank-Abfragen und Browser-Automatisierung. RBAC-gesichert."
    click IN "#invoice-ninja" "Invoice Ninja: Rechnungserstellung, Kundenverwaltung und Zahlungsabwicklung via Stripe. Geschuetzt durch oauth2-proxy. Eigene MariaDB-Instanz."
    click VW "#vaultwarden" "Vaultwarden: Self-hosted Bitwarden-kompatibler Passwort-Manager. Speichert verschluesselte Vault-Items in PostgreSQL. OIDC-Login via Keycloak."
    click BB "#billing-bot" "billing-bot: Go-Microservice. Verbindet Mattermost Slash-Commands mit Invoice Ninja API fuer schnelle Rechnungs- und Kundenerstellung aus dem Chat."
    click OL "#outline" "Outline: Kollaboratives Wiki fuer Teamwissen. Markdown-basiert mit Echtzeit-Bearbeitung, verschachtelten Dokumenten und Volltextsuche. Redis fuer Sessions."
    click WB "#whiteboard" "Whiteboard: Nextcloud-integriertes Whiteboard fuer visuelle Zusammenarbeit. Echtzeit-Kollaboration ueber WebSockets."
    click MP "#mailpit" "Mailpit: SMTP-Testserver fuer Entwicklung. Faengt alle ausgehenden E-Mails ab (kein Versand). Web-UI zur Inspektion von Benachrichtigungen."
    click DB "#datenbank-layout" "PostgreSQL 16 shared-db: 5 isolierte Datenbanken (keycloak, mattermost, nextcloud, vaultwarden, outline) mit eigenem User je Service."
    click MARIA "#datenbank-layout" "MariaDB 11: Dedizierte Instanz fuer Invoice Ninja (benoetigt MySQL-Kompatibilitaet)."
    click OS "#datenbank-layout" "OpenSearch 2.17: Elasticsearch-kompatibler Suchindex fuer Mattermost Volltextsuche und Autocomplete."
    click WEB "#website" "Website: Astro + Svelte Unternehmenswebsite mit Kontaktformular (Mattermost Webhook) und OIDC-Login."
    click PROM "#monitoring" "Prometheus: Metriken-Sammlung aller Kubernetes-Ressourcen. Speist DSGVO-Compliance-Dashboard."
    click GRAF "#monitoring" "Grafana: Visualisierung der Prometheus-Metriken. Enthaelt DSGVO-Compliance-Dashboard (NFA-02)."
    click WHISPER "#whisper" "Whisper: faster-whisper Transkriptionsservice fuer Audio-zu-Text Konvertierung."
    click SIG "#talk-hpb" "spreed-signaling: WebRTC-Signaling-Server fuer Nextcloud Talk Videokonferenzen."
    click MCP_K8S "#claude-code" "MCP Kubernetes: Read-only Zugriff auf Pods, Deployments, Services, Logs. Kann Deployments neu starten (mit Genehmigung)."
    click MCP_PG "#claude-code" "MCP Postgres: Superuser-Zugriff auf alle shared-db Datenbanken fuer Analyse und Debugging."

    %% --- Styles ---
    classDef identity_style fill:#4a90d9,color:#fff,stroke:#2d6a9f
    classDef collab_style fill:#2d8659,color:#fff,stroke:#1a5c3a
    classDef ai_style fill:#8b5cf6,color:#fff,stroke:#6d3ad4
    classDef billing_style fill:#d97706,color:#fff,stroke:#b45309
    classDef data_style fill:#6b7280,color:#fff,stroke:#4b5563
    classDef tools_style fill:#0891b2,color:#fff,stroke:#0e7490
    classDef infra_style fill:#374151,color:#fff,stroke:#1f2937

    class KC,PROXY,OAUTH identity_style
    class MM,NC,CO,WB,OL collab_style
    class OC,MCP_K8S,MCP_PG,MCP_BR,WHISPER ai_style
    class IN,BB billing_style
    class DB,MARIA,OS,REDIS data_style
    class VW,MP,DOCS tools_style
    class Traefik,WEB,PROM,GRAF infra_style
```

---

## Workflows

### SSO-Authentifizierung (OIDC)

Keycloak ist der zentrale Identity Provider. Alle Services authentifizieren ueber OpenID Connect. Mattermost nutzt einen internen Proxy, da es das GitLab-OAuth-Protokoll erwartet.

```mermaid
sequenceDiagram
    actor User as Benutzer
    participant Browser
    participant Service as Service<br/>(z.B. Mattermost)
    participant Proxy as mm-keycloak-proxy<br/>(nur Mattermost)
    participant KC as Keycloak<br/>auth.localhost
    participant DB as PostgreSQL<br/>keycloak DB

    User ->> Browser: Oeffnet chat.localhost
    Browser ->> Service: GET /
    Service -->> Browser: 302 Redirect → auth.localhost
    Browser ->> KC: /realms/workspace/protocol/openid-connect/auth
    KC ->> DB: Session + Client pruefen
    DB -->> KC: Client-Config
    KC -->> Browser: Login-Formular
    User ->> Browser: Credentials eingeben
    Browser ->> KC: POST Login
    KC ->> DB: User validieren
    DB -->> KC: User + Rollen
    KC -->> Browser: 302 Redirect + Authorization Code

    alt Mattermost (GitLab-kompatibel)
        Browser ->> Service: Callback mit Code
        Service ->> Proxy: Token-Request (intern)
        Proxy ->> KC: /protocol/openid-connect/token
        KC -->> Proxy: Access Token + ID Token
        Proxy -->> Service: Token
        Service ->> Proxy: Userinfo-Request
        Proxy ->> KC: /protocol/openid-connect/userinfo
        KC -->> Proxy: User Claims
        Proxy -->> Service: User-Daten
    else Andere Services (Standard OIDC)
        Browser ->> Service: Callback mit Code
        Service ->> KC: Token Exchange (direkt)
        KC -->> Service: Access Token + ID Token
        Service ->> KC: Userinfo (optional)
        KC -->> Service: User Claims
    end

    Service -->> Browser: Session erstellt, Dashboard laden
    Browser -->> User: Eingeloggt
```

**Registrierte OIDC-Clients:** Mattermost, Nextcloud, Invoice Ninja, Claude Code, Vaultwarden, Outline, Website (7 Clients im Realm `workspace`)

---

### Datei-Kollaboration (Nextcloud + Collabora)

Dokumente werden in Nextcloud gespeichert und ueber das WOPI-Protokoll in Collabora Online bearbeitet. Mehrere Benutzer koennen gleichzeitig am selben Dokument arbeiten.

```mermaid
sequenceDiagram
    actor User as Benutzer
    participant Browser
    participant NC as Nextcloud<br/>files.localhost
    participant CO as Collabora Online<br/>office.localhost
    participant DB as PostgreSQL<br/>nextcloud DB
    participant Store as Nextcloud Storage<br/>50 Gi PVC

    User ->> Browser: Datei oeffnen
    Browser ->> NC: GET /apps/richdocuments/...
    NC ->> DB: Datei-Metadaten laden
    DB -->> NC: Pfad, Berechtigungen, Lock-Status
    NC ->> NC: WOPI Token generieren
    NC -->> Browser: Collabora iFrame URL + WOPI Token

    Browser ->> CO: iFrame laden (office.localhost)
    CO ->> NC: WOPI CheckFileInfo (Token validieren)
    NC -->> CO: Dateiname, Groesse, Berechtigungen
    CO ->> NC: WOPI GetFile
    NC ->> Store: Datei lesen
    Store -->> NC: Datei-Inhalt
    NC -->> CO: Dokument-Bytes
    CO -->> Browser: Editor mit Dokument

    loop Echtzeit-Kollaboration
        User ->> Browser: Text bearbeiten
        Browser ->> CO: Aenderung senden (WebSocket)
        CO ->> CO: Aenderungen zusammenfuehren
        CO -->> Browser: Aktualisierte Ansicht (alle Teilnehmer)
    end

    User ->> Browser: Speichern / Schliessen
    Browser ->> CO: Save-Trigger
    CO ->> NC: WOPI PutFile
    NC ->> Store: Datei schreiben
    NC ->> DB: Metadaten aktualisieren
    NC -->> CO: Erfolg
```

---

### Videokonferenz (Nextcloud Talk + HPB)

Nextcloud Talk nutzt den High Performance Backend (HPB) Stack fuer skalierbare Videokonferenzen. Signaling koordiniert die Teilnehmer, Janus leitet die Medienstroeme.

```mermaid
sequenceDiagram
    actor User1 as Teilnehmer A
    actor User2 as Teilnehmer B
    participant NC as Nextcloud Talk<br/>files.localhost
    participant SIG as spreed-signaling<br/>signaling.localhost
    participant NATS as NATS<br/>Message Bus
    participant JANUS as Janus<br/>WebRTC SFU
    participant TURN as coturn<br/>NAT Traversal

    User1 ->> NC: Anruf starten
    NC ->> NC: Raum erstellen, Token generieren
    NC -->> User1: Signaling-URL + Token

    User1 ->> SIG: WebSocket verbinden + Auth
    SIG ->> NC: Backend-Validierung (HTTP)
    NC -->> SIG: Teilnehmer autorisiert
    SIG ->> NATS: Raum-Event publizieren

    User2 ->> NC: Anruf beitreten
    NC -->> User2: Signaling-URL + Token
    User2 ->> SIG: WebSocket verbinden + Auth
    SIG ->> NATS: Teilnehmer-Event

    Note over SIG,JANUS: SDP Offer/Answer Austausch

    User1 ->> SIG: SDP Offer
    SIG ->> JANUS: Publish Stream
    JANUS -->> SIG: SDP Answer
    SIG -->> User1: SDP Answer

    User2 ->> SIG: Subscribe Request
    SIG ->> JANUS: Subscribe to Stream
    JANUS -->> SIG: Media Stream
    SIG -->> User2: SDP Answer

    alt Direktverbindung moeglich
        User1 <--> JANUS: Media (RTP/SRTP)
        JANUS <--> User2: Media (RTP/SRTP)
    else NAT/Firewall blockiert
        User1 <--> TURN: TURN Relay
        TURN <--> JANUS: Media weiterleiten
        JANUS <--> User2: Media (RTP/SRTP)
    end
```

---

### Abrechnung (billing-bot + Invoice Ninja)

Der billing-bot verbindet Mattermost Slash-Commands mit der Invoice Ninja API. Zahlungen laufen ueber Stripe.

```mermaid
sequenceDiagram
    actor User as Team-Mitglied
    participant MM as Mattermost<br/>chat.localhost
    participant BB as billing-bot<br/>:8090
    participant IN as Invoice Ninja<br/>billing.localhost
    participant MARIA as MariaDB<br/>invoiceninja DB
    participant OAUTH as oauth2-proxy
    participant KC as Keycloak
    participant Stripe as Stripe API<br/>(extern)

    User ->> MM: /billing invoice Acme Corp

    MM ->> BB: POST /slash<br/>{command, text, user_id}
    BB ->> IN: GET /api/v1/clients?name=Acme<br/>X-Api-Token Header
    IN ->> MARIA: SELECT * FROM clients
    MARIA -->> IN: Client-Daten
    IN -->> BB: Client gefunden

    BB ->> IN: POST /api/v1/invoices<br/>{client_id, items}
    IN ->> MARIA: INSERT INTO invoices
    MARIA -->> IN: Invoice #1042
    IN -->> BB: Invoice erstellt

    BB -->> MM: Antwort mit Link + Quick-Actions
    MM -->> User: "Rechnung #1042 erstellt fuer Acme Corp"

    Note over User,Stripe: Kunde erhaelt Rechnung per E-Mail

    User ->> MM: Link klicken → billing.localhost
    MM -->> User: Redirect
    User ->> OAUTH: billing.localhost/invoices/1042
    OAUTH ->> KC: OIDC Auth pruefen
    KC -->> OAUTH: Token valid
    OAUTH ->> IN: Request weiterleiten
    IN -->> User: Rechnungsansicht mit Stripe-Widget

    User ->> Stripe: Zahlung (Kreditkarte / SEPA)
    Stripe -->> IN: Webhook: payment_intent.succeeded
    IN ->> MARIA: UPDATE invoices SET status=paid
```

---

### KI-Assistent (Claude Code + MCP)

Claude Code nutzt Claude Sonnet 4 mit MCP-Servern (Model Context Protocol) fuer Kubernetes-Management, Datenbank-Analyse und Browser-Automatisierung.

```mermaid
sequenceDiagram
    actor Admin as Administrator
    participant OC as Claude Code<br/>ai.localhost
    participant Claude as Claude Sonnet 4<br/>Anthropic API
    participant MCP_K as MCP Kubernetes<br/>mcp-k8s-go
    participant K8S as Kubernetes API
    participant MCP_P as MCP Postgres
    participant DB as PostgreSQL<br/>shared-db
    participant MM as Mattermost<br/>Approval-Channel

    Admin ->> OC: "Zeige Pod-Status und DB-Groessen"
    OC ->> Claude: User-Prompt + System-Prompt + Tools

    par Kubernetes-Abfrage
        Claude ->> MCP_K: list_pods(namespace=workspace)
        MCP_K ->> K8S: GET /api/v1/namespaces/workspace/pods
        K8S -->> MCP_K: Pod-Liste mit Status
        MCP_K -->> Claude: Pod-Status formatiert
    and Datenbank-Abfrage
        Claude ->> MCP_P: query("SELECT pg_database_size(...)")
        MCP_P ->> DB: SQL ausfuehren
        DB -->> MCP_P: Ergebnis
        MCP_P -->> Claude: DB-Groessen
    end

    Claude -->> OC: Zusammengefasste Antwort
    OC -->> Admin: Pod-Status + DB-Groessen anzeigen

    Note over Admin,MM: Destruktive Aktionen erfordern Genehmigung

    Admin ->> OC: "Starte Mattermost neu"
    OC ->> Claude: Prompt + Tools
    Claude ->> MM: Webhook: Genehmigungsanfrage<br/>"Mattermost Deployment neu starten?"
    MM -->> Admin: Nachricht im Admin-Channel

    Admin ->> MM: Genehmigung erteilen
    Claude ->> MCP_K: patch_deployment(mattermost, restart)
    MCP_K ->> K8S: PATCH /apis/apps/v1/.../deployments/mattermost
    K8S -->> MCP_K: Rollout gestartet
    MCP_K -->> Claude: Deployment neu gestartet
    Claude ->> MM: Bestaetigung an Admin-Channel
    Claude -->> OC: "Mattermost wird neu gestartet"
    OC -->> Admin: Erfolgsmeldung
```

**MCP-Server und Berechtigungen (RBAC):**

| MCP-Server | Protokoll | Kann | Kann nicht |
|------------|-----------|------|------------|
| mcp-kubernetes | mcp-k8s-go | Pods, Deployments, Services, Logs, Events lesen; Deployments skalieren/neustarten | Loeschen, Erstellen, Exec, Secrets lesen |
| mcp-postgres | @modelcontextprotocol/server-postgres | Alle 5 shared-db Datenbanken abfragen (Superuser) | Schreibzugriff (per Konvention im System-Prompt) |
| mcp-browser | Playwright | URLs navigieren, Screenshots, Formulare ausfuellen | Keine Netzwerk-Beschraenkung (Cluster-intern) |
| mcp-mattermost | legard/mcp-server-mattermost | Channels, DMs, Posts lesen/schreiben | Admin-Operationen |
| mcp-nextcloud | ghcr.io/cbcoutinho/nextcloud-mcp-server | Dateien, Kalender, Kontakte (WebDAV/CalDAV/CardDAV) | Admin-Einstellungen |
| mcp-invoiceninja | ckanthony/openapi-mcp | Kunden, Rechnungen, Produkte, Zahlungen (REST API) | Direkte DB-Zugriffe |
| mcp-keycloak | quay.io/sshaaf/keycloak-mcp-server | Benutzer, Gruppen, Rollen, Sessions verwalten | Realm-Konfiguration aendern |
| mcp-github | ghcr.io/github/github-mcp-server | Repos, Issues, PRs, Code-Suche (PAT erforderlich) | Admin-Rechte |
| mcp-stripe | @stripe/agent-toolkit | Kunden, Zahlungen, Rechnungen, Abonnements | Kontoverwaltung |

---

### E-Mail-Zustellung (Mailpit)

Im Entwicklungsmodus faengt Mailpit alle ausgehenden E-Mails ab. In Produktion wird ein externer SMTP-Server konfiguriert.

```mermaid
flowchart LR
    MM["fa:fa-comments Mattermost\nnoreply@workspace.local"] --> MP
    NC["fa:fa-cloud Nextcloud\nnextcloud@workspace.local"] --> MP
    IN["fa:fa-receipt Invoice Ninja\nbilling@workspace.local"] --> MP

    MP{{"fa:fa-envelope Mailpit\nSMTP :1025 | Web :8025"}}

    MP --> INBOX["fa:fa-inbox Web-UI\nmail.localhost\nAlle Mails einsehbar"]

    style MP fill:#0891b2,color:#fff,stroke:#0e7490
```

---

## Datenbank-Layout

### Uebersicht

```mermaid
erDiagram
    SHARED_DB["PostgreSQL 16 (shared-db) — 25 Gi PVC"] {
        database keycloak "Realms, Users, Sessions, Clients"
        database mattermost "Teams, Channels, Messages, Files"
        database nextcloud "Files, Calendar, Contacts, Shares"
        database vaultwarden "Encrypted Vaults, Organizations"
        database outline "Documents, Collections, Users"
    }

    MARIADB["MariaDB 11 (invoiceninja-mariadb) — 5 Gi PVC"] {
        database invoiceninja "Clients, Invoices, Products, Payments"
    }

    OPENSEARCH["OpenSearch 2.17 (opensearch) — 5 Gi PVC"] {
        index mattermost_posts "Volltextindex aller Nachrichten"
        index mattermost_channels "Channel-Suchindex"
    }

    REDIS["Redis 7 (Sidecar in Outline-Pod)"] {
        db sessions "Outline User Sessions"
        db cache "Document Render Cache"
    }

    KC_SVC["Keycloak"] ||--|| SHARED_DB : "keycloak DB"
    MM_SVC["Mattermost"] ||--|| SHARED_DB : "mattermost DB"
    NC_SVC["Nextcloud"] ||--|| SHARED_DB : "nextcloud DB"
    VW_SVC["Vaultwarden"] ||--|| SHARED_DB : "vaultwarden DB"
    OL_SVC["Outline"] ||--|| SHARED_DB : "outline DB"
    OL_SVC ||--|| REDIS : "sessions + cache"
    IN_SVC["Invoice Ninja"] ||--|| MARIADB : "invoiceninja DB"
    MM_SVC ||--|| OPENSEARCH : "Suchindex"
    MCP_PG["MCP Postgres"] }|--|| SHARED_DB : "superuser read-only"
```

### Datenbank-Isolation

Jede Datenbank hat einen eigenen User mit ausschliesslichem Zugriff auf seine Datenbank:

| Datenbank | User | Service | Besonderheiten |
|-----------|------|---------|----------------|
| `keycloak` | `keycloak` | Keycloak | Realm-Export als ConfigMap |
| `mattermost` | `mattermost` | Mattermost | + OpenSearch fuer Volltextsuche |
| `nextcloud` | `nextcloud` | Nextcloud | Datei-Metadaten, Kalender, Kontakte |
| `vaultwarden` | `vaultwarden` | Vaultwarden | Verschluesselte Vault-Items |
| `outline` | `outline` | Outline | + Redis Sidecar fuer Sessions |
| `invoiceninja` | `invoiceninja` | Invoice Ninja | Separate MariaDB (MySQL-Kompatibilitaet) |

Die Init-Skripte in `shared-db` erstellen User und Datenbanken idempotent beim ersten Start und synchronisieren Passwoerter bei Neustarts.

---

## Namespaces

| Namespace | Zweck |
|-----------|-------|
| `workspace` | Alle Kernservices (Mattermost, Nextcloud, Keycloak, etc.) |
| `website` | Astro + Svelte Unternehmenswebsite |
| `monitoring` | Prometheus + Grafana Stack (optional) |
| `cert-manager` | TLS-Zertifikate via Let's Encrypt (Produktion) |
| `kube-system` | Traefik Ingress Controller (k3s built-in) |

Der `workspace`-Namespace hat Pod Security Standards konfiguriert:
- **enforce: baseline** -- Mindestanforderungen erzwungen
- **warn: restricted** -- Warnungen bei Verstoss gegen strengere Richtlinien

## Netzwerk und Routing

Traefik (k3s built-in) routet anhand von Host-Headern:

| Host | Service | Port |
|------|---------|------|
| auth.localhost | keycloak | 8080 |
| chat.localhost | mattermost | 8065 |
| files.localhost | nextcloud | 80 |
| office.localhost | collabora | 9980 |
| signaling.localhost | spreed-signaling | 8080 |
| meet.localhost | spreed-signaling | 8080 |
| ai.localhost | claude-code | 8080 |
| billing.localhost | oauth2-proxy-invoiceninja | 4180 |
| vault.localhost | vaultwarden | 80 |
| board.localhost | whiteboard | 3002 |
| mail.localhost | mailpit | 8025 |
| docs.localhost | docs | 80 |
| web.localhost | website | 4321 |
| wiki.localhost | outline | 3000 |

Alle Domains werden zentral in `k3d/configmap-domains.yaml` definiert.

## Persistent Storage

| PVC | Groesse | Service |
|-----|---------|---------|
| shared-db-data | 25 Gi | PostgreSQL |
| mattermost-data | 20 Gi | Mattermost Dateien |
| nextcloud-app | 2 Gi | Nextcloud App |
| nextcloud-data | 50 Gi | Nextcloud Dateien |
| invoiceninja-public | 5 Gi | Invoice Ninja |
| invoiceninja-mariadb-data | 5 Gi | MariaDB |
| vaultwarden-data | 5 Gi | Vaultwarden |
| opensearch-data | 5 Gi | OpenSearch Index |
| outline-data | 5 Gi | Outline Wiki |
| backup-pvc | 1 Gi | Verschluesselte Backups |

## Deployment-Ablauf

```mermaid
flowchart TD
    A[task cluster:create] -->|k3d-config.yaml| B[k3d Cluster + Registry]
    B --> C[task workspace:deploy]
    C --> D[Namespace + ConfigMaps]
    D --> E[kustomize build k3d/]
    E --> F[shared-db wartet auf Ready]
    F --> G[Alle Services parallel deployen]
    G --> H{Optionale Schritte}

    H --> I[task workspace:post-setup<br/>Nextcloud Apps]
    H --> J[task mcp:deploy<br/>MCP Server Pods]
    H --> K[task workspace:monitoring<br/>Prometheus + Grafana]
    H --> L[task workspace:billing-setup<br/>billing-bot Image]
    H --> M[task workspace:vaultwarden:seed<br/>Secret-Templates]

    style A fill:#2d6a4f,color:#fff
    style C fill:#2d6a4f,color:#fff
```

Alternativ: `task workspace:up` fuer vollautomatisches Setup (Cluster + MVP + MCP + Monitoring + Billing).

## Backup-Strategie

- **Zeitplan:** Taeglich um 02:00 UTC (CronJob)
- **Scope:** PostgreSQL-Datenbanken (keycloak, mattermost, nextcloud)
- **Verschluesselung:** AES-256-CBC mit PBKDF2 (openssl)
- **Rotation:** 30-Tage-Aufbewahrung, aeltere Backups werden automatisch geloescht
- **Speicher:** 1 Gi PVC (`backup-pvc`)
