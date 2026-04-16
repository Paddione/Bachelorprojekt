<div class="page-hero">
  <span class="page-hero-icon">🏗️</span>
  <div class="page-hero-body">
    <div class="page-hero-title">Architektur</div>
    <p class="page-hero-desc">Systemübersicht, Kubernetes-Cluster-Topologie, Service-Abhängigkeiten und Infrastruktur-Design des Workspace MVP.</p>
    <div class="page-hero-meta">
      <span class="page-hero-tag">Für Administratoren</span>
      <span class="page-hero-tag">Kubernetes</span>
      <span class="page-hero-tag">Mermaid Diagramm</span>
    </div>
  </div>
  <a href="#/" class="page-hero-back">← Übersicht</a>
</div>

# Architektur

## Systemuebersicht

Workspace MVP ist eine Kubernetes-basierte Kollaborationsplattform fuer kleine Teams. Alle Services laufen als Deployments in einem k3d/k3s Cluster mit Traefik als Ingress Controller. Daten bleiben vollstaendig on-premises (DSGVO by Design).

> **Tipp:** Die Service-Boxen im Diagramm sind klickbar und fuehren zur jeweiligen Service-Dokumentation. Hover zeigt eine Kurzbeschreibung.

```mermaid
flowchart TB
    User([fa:fa-user Benutzer / Browser])

    subgraph cluster ["fa:fa-server k3d/k3s Cluster"]
        direction TB
        Traefik{{"fa:fa-globe Traefik Ingress\n80 / 443"}}

        subgraph identity ["fa:fa-shield-halved Identitaet"]
            KC["fa:fa-key Keycloak\nauth.localhost"]
            OAUTH2["oauth2-proxy (Docs)"]
        end

        subgraph collaboration ["fa:fa-users Kommunikation & Zusammenarbeit"]
            NC["fa:fa-cloud Nextcloud + Talk\nfiles.localhost"]
            CO["fa:fa-file-word Collabora Online\noffice.localhost"]
            WB["fa:fa-chalkboard Whiteboard\nboard.localhost"]
            REC["fa:fa-record-vinyl Talk Recording"]
        end

        subgraph video ["fa:fa-video Talk HPB Stack"]
            SIG["spreed-signaling\nsignaling.localhost"]
            JANUS["Janus Gateway"]
            NATS["NATS"]
            COTURN["coturn"]
        end

        subgraph ai ["fa:fa-robot KI & Automatisierung"]
            OC["fa:fa-brain Claude Code KI\nai.localhost"]
            MCP_K8S["MCP Kubernetes"]
            MCP_PG["MCP Postgres"]
            MCP_BR["MCP Browser"]
            MCP_GRAF["MCP Grafana"]
            MCP_PROM["MCP Prometheus"]
            WHISPER["fa:fa-microphone Whisper"]
            EMB["fa:fa-vector-square Embedding"]
        end

        subgraph tools ["fa:fa-toolbox Werkzeuge"]
            VW["fa:fa-lock Vaultwarden\nvault.localhost"]
            MP["fa:fa-envelope Mailpit\nmail.localhost"]
            DOCS["fa:fa-file-lines Docs\ndocs.localhost"]
        end

        subgraph data ["fa:fa-database Datenhaltung"]
            DB[("PostgreSQL 16\nshared-db\n5 Datenbanken")]
        end

        subgraph external ["Weitere Namespaces"]
            WEB["fa:fa-globe Website Astro + Messaging\nweb.localhost"]
        end
    end

    %% --- Ingress Layer ---
    User --> Traefik
    Traefik --> KC
    Traefik --> NC
    Traefik --> CO
    Traefik --> SIG
    Traefik --> OC
    Traefik --> OAUTH2
    Traefik --> VW
    Traefik --> WB
    Traefik --> MP
    Traefik --> DOCS
    Traefik --> WEB

    %% --- OIDC (Keycloak als IdP) ---
    KC -. "OIDC" .-> NC
    KC -. "OIDC" .-> OC
    KC -. "OIDC" .-> VW
    KC -. "OIDC" .-> WEB

    %% --- Auth Proxies ---
    OAUTH2 --> KC
    OAUTH2 --> DOCS

    %% --- Collaboration ---
    NC --> CO
    NC --> SIG
    SIG --- JANUS
    SIG --- NATS
    JANUS --- COTURN

    %% --- AI/MCP ---
    OC --> MCP_K8S
    OC --> MCP_PG
    OC --> MCP_BR
    OC --> MCP_GRAF
    OC --> MCP_PROM

    %% --- Recording ---
    NC --> REC

    %% --- Datenbanken ---
    KC --> DB
    NC --> DB
    VW --> DB
    OC --> DB
    WEB --> DB

    %% --- SMTP ---
    NC -. "SMTP" .-> MP
    WEB -. "SMTP" .-> MP

    %% --- Klickbare Nodes ---
    click KC "#/keycloak" "Keycloak: Zentraler OIDC Identity Provider fuer SSO. Verwaltet Benutzer, Rollen und 5 OIDC-Clients. Speichert Sessions und Realm-Konfiguration in PostgreSQL."
    click NC "#/services?id=nextcloud-dateien-talk" "Nextcloud: Dateiverwaltung, Kalender, Kontakte und Videokonferenzen via Talk. WOPI-Integration mit Collabora fuer Office-Dokumente. WebRTC via HPB Stack."
    click CO "#/services?id=collabora-online-office" "Collabora Online: LibreOffice-basierter Office-Editor im Browser. Bearbeitet DOCX, XLSX, PPTX, ODT Dateien kollaborativ ueber WOPI-Protokoll mit Nextcloud."
    click OC "#/services?id=claude-code-ki-assistent" "Claude Code: KI-Assistent mit Claude Sonnet 4. Nutzt MCP-Server fuer Kubernetes-Verwaltung, Datenbank-Abfragen und Browser-Automatisierung. RBAC-gesichert."
    click VW "#/services?id=vaultwarden-passwoerter" "Vaultwarden: Self-hosted Bitwarden-kompatibler Passwort-Manager. Speichert verschluesselte Vault-Items in PostgreSQL. OIDC-Login via Keycloak."
    click WB "#/services?id=whiteboard" "Whiteboard: Nextcloud-integriertes Whiteboard fuer visuelle Zusammenarbeit. Echtzeit-Kollaboration ueber WebSockets."
    click MP "#/services?id=mailpit-dev-mail" "Mailpit: SMTP-Testserver fuer Entwicklung. Faengt alle ausgehenden E-Mails ab (kein Versand). Web-UI zur Inspektion von Benachrichtigungen."
    click DB "#/architecture?id=datenbank-layout" "PostgreSQL 16 shared-db: 5 isolierte Datenbanken (keycloak, nextcloud, vaultwarden, website, pentest) mit eigenem User je Service."
    click WEB "#/services?id=website-astro-svelte" "Website: Astro + Svelte Unternehmenswebsite mit Messaging-System (Chat-Raeume, Inbox, DMs), OIDC-Login, Stripe-Checkout und Admin-Panel (/admin)."
    click WHISPER "#/services?id=whisper-transkription-optional" "Whisper: faster-whisper Transkriptionsservice fuer Audio-zu-Text Konvertierung."
    click EMB "#/services?id=embedding-text-vektorisierung" "Embedding: infinity-emb Text-Vektorisierung (BAAI/bge-base-en-v1.5) fuer Meeting-Transkript-Analyse."
    click REC "#/services?id=talk-recording-anruf-aufzeichnung" "Talk Recording: Firefox/geckodriver-basierte Anruf-Aufzeichnung fuer Nextcloud Talk."
    click SIG "#/services?id=talk-hpb-signaling" "spreed-signaling: WebRTC-Signaling-Server fuer Nextcloud Talk Videokonferenzen."
    click MCP_K8S "#/services?id=claude-code-ki-assistent" "MCP Kubernetes: Read-only Zugriff auf Pods, Deployments, Services, Logs. Kann Deployments neu starten (mit Genehmigung)."
    click MCP_PG "#/services?id=claude-code-ki-assistent" "MCP Postgres: Superuser-Zugriff auf alle shared-db Datenbanken fuer Analyse und Debugging."
    click MCP_GRAF "#/services?id=claude-code-ki-assistent" "MCP Grafana: Zugriff auf Grafana Dashboards und Metriken."
    click MCP_PROM "#/services?id=claude-code-ki-assistent" "MCP Prometheus: Direkte PromQL-Abfragen fuer Cluster-Metriken."

    %% --- Styles ---
    classDef identity_style fill:#1b3766,color:#e8c870,stroke:#2a5291
    classDef collab_style fill:#1a3d28,color:#e8c870,stroke:#2a5c3a
    classDef ai_style fill:#2a1654,color:#e8c870,stroke:#3d2478
    classDef data_style fill:#1f2937,color:#aabbcc,stroke:#374151
    classDef tools_style fill:#083344,color:#e8c870,stroke:#0e4f68
    classDef infra_style fill:#1a1a2e,color:#aabbcc,stroke:#2a2a4a

    class KC,OAUTH2 identity_style
    class NC,CO,WB,REC collab_style
    class OC,MCP_K8S,MCP_PG,MCP_BR,MCP_GRAF,MCP_PROM,WHISPER,EMB ai_style
    class DB data_style
    class VW,MP,DOCS tools_style
    class Traefik,WEB infra_style
```

---

## Workflows

### SSO-Authentifizierung (OIDC)

Keycloak ist der zentrale Identity Provider. Alle Services authentifizieren ueber OpenID Connect (Standard Authorization Code Flow). Docs ist zusaetzlich durch oauth2-proxy vorgeschaltet.

```mermaid
sequenceDiagram
    autonumber

    actor User as 👤 Benutzer
    participant Browser as 🌐 Browser
    participant Service as 💬 Service<br/>(z.B. Nextcloud, Website)
    participant KC as 🔑 Keycloak<br/>auth.localhost
    participant DB as 🗄️ PostgreSQL<br/>keycloak DB

    rect rgba(74, 144, 217, 0.1)
        Note over User,DB: Phase 1: Redirect zum Identity Provider
        User ->> Browser: Oeffnet geschuetzte Seite
        Browser ->> Service: GET /
        Service -->> Browser: 302 Redirect → auth.localhost
        Browser ->> KC: /realms/workspace/protocol/openid-connect/auth
        KC ->> DB: Session + Client pruefen
        DB -->> KC: Client-Config
        KC -->> Browser: Login-Formular
    end

    rect rgba(45, 134, 89, 0.1)
        Note over User,DB: Phase 2: Authentifizierung
        User ->> Browser: Credentials eingeben
        Browser ->> KC: POST Login
        KC ->> DB: User validieren
        DB -->> KC: User + Rollen
        KC -->> Browser: 302 Redirect + Authorization Code
    end

    rect rgba(139, 92, 246, 0.1)
        Note over User,KC: Phase 3: Token-Austausch (Standard OIDC)
        Browser ->> Service: Callback mit Code
        Service ->> KC: Token Exchange (direkt)
        KC -->> Service: Access Token + ID Token
        Service ->> KC: Userinfo (optional)
        KC -->> Service: User Claims
    end

    Service -->> Browser: Session erstellt, Dashboard laden
    Browser -->> User: ✅ Eingeloggt
```

**Registrierte OIDC-Clients:** Nextcloud, Claude Code, Vaultwarden, Website, Docs (5 Clients im Realm `workspace`)

---

### Datei-Kollaboration (Nextcloud + Collabora)

Dokumente werden in Nextcloud gespeichert und ueber das WOPI-Protokoll in Collabora Online bearbeitet. Mehrere Benutzer koennen gleichzeitig am selben Dokument arbeiten.

```mermaid
sequenceDiagram
    autonumber

    actor User as 👤 Benutzer
    participant Browser as 🌐 Browser
    participant NC as ☁️ Nextcloud<br/>files.localhost
    participant CO as 📝 Collabora Online<br/>office.localhost
    participant DB as 🗄️ PostgreSQL<br/>nextcloud DB
    participant Store as 💾 Nextcloud Storage<br/>50 Gi PVC

    rect rgba(45, 134, 89, 0.1)
        Note over User,Store: Phase 1: Dokument oeffnen
        User ->> Browser: Datei oeffnen
        Browser ->> NC: GET /apps/richdocuments/...
        NC ->> DB: Datei-Metadaten laden
        DB -->> NC: Pfad, Berechtigungen, Lock-Status
        NC ->> NC: WOPI Token generieren
        NC -->> Browser: Collabora iFrame URL + WOPI Token
    end

    rect rgba(74, 144, 217, 0.1)
        Note over Browser,Store: Phase 2: WOPI-Protokoll
        Browser ->> CO: iFrame laden (office.localhost)
        CO ->> NC: WOPI CheckFileInfo (Token validieren)
        NC -->> CO: Dateiname, Groesse, Berechtigungen
        CO ->> NC: WOPI GetFile
        NC ->> Store: Datei lesen
        Store -->> NC: Datei-Inhalt
        NC -->> CO: Dokument-Bytes
        CO -->> Browser: Editor mit Dokument
    end

    rect rgba(139, 92, 246, 0.1)
        Note over User,CO: Phase 3: Echtzeit-Bearbeitung
        loop Echtzeit-Kollaboration
            User ->> Browser: Text bearbeiten
            Browser ->> CO: Aenderung senden (WebSocket)
            CO ->> CO: Aenderungen zusammenfuehren
            CO -->> Browser: Aktualisierte Ansicht (alle Teilnehmer)
        end
    end

    rect rgba(217, 119, 6, 0.1)
        Note over User,Store: Phase 4: Speichern
        User ->> Browser: Speichern / Schliessen
        Browser ->> CO: Save-Trigger
        CO ->> NC: WOPI PutFile
        NC ->> Store: Datei schreiben
        NC ->> DB: Metadaten aktualisieren
        NC -->> CO: ✅ Erfolg
    end
```

---

### Videokonferenz (Nextcloud Talk + HPB)

Nextcloud Talk nutzt den High Performance Backend (HPB) Stack fuer skalierbare Videokonferenzen. Signaling koordiniert die Teilnehmer, Janus leitet die Medienstroeme.

```mermaid
sequenceDiagram
    autonumber

    actor User1 as 👤 Teilnehmer A
    actor User2 as 👥 Teilnehmer B
    participant NC as 📹 Nextcloud Talk<br/>files.localhost
    participant SIG as 📡 spreed-signaling<br/>signaling.localhost
    participant NATS as 📨 NATS<br/>Message Bus
    participant JANUS as 🎥 Janus<br/>WebRTC SFU
    participant TURN as 🔄 coturn<br/>NAT Traversal

    rect rgba(45, 134, 89, 0.1)
        Note over User1,NATS: Phase 1: Raum erstellen & Teilnehmer verbinden
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
    end

    rect rgba(74, 144, 217, 0.1)
        Note over User1,JANUS: Phase 2: SDP Offer/Answer Austausch
        User1 ->> SIG: SDP Offer
        SIG ->> JANUS: Publish Stream
        JANUS -->> SIG: SDP Answer
        SIG -->> User1: SDP Answer
        User2 ->> SIG: Subscribe Request
        SIG ->> JANUS: Subscribe to Stream
        JANUS -->> SIG: Media Stream
        SIG -->> User2: SDP Answer
    end

    rect rgba(139, 92, 246, 0.1)
        Note over User1,TURN: Phase 3: Medien-Uebertragung
        alt Direktverbindung moeglich
            User1 <<->> JANUS: Media (RTP/SRTP)
            JANUS <<->> User2: Media (RTP/SRTP)
        else NAT/Firewall blockiert
            User1 <<->> TURN: TURN Relay
            TURN <<->> JANUS: Media weiterleiten
            JANUS <<->> User2: Media (RTP/SRTP)
        end
    end
```

---

### Stripe-Checkout (Website)

Die Website integriert Stripe Checkout direkt — ohne Invoice Ninja. Kunden bezahlen Leistungen per Kreditkarte oder SEPA direkt auf der Leistungen-Seite oder ueber den Homepage-CTA.

```mermaid
sequenceDiagram
    autonumber

    actor User as 👤 Kunde
    participant Browser as 🌐 Browser
    participant WEB as 🌐 Website<br/>web.localhost
    participant DB as 🗄️ PostgreSQL<br/>website DB
    participant Stripe as 💳 Stripe API<br/>(extern)

    rect rgba(217, 119, 6, 0.1)
        Note over User,Stripe: Phase 1: Checkout starten
        User ->> Browser: Leistungen-Seite oder CTA
        Browser ->> WEB: POST /api/checkout<br/>{priceId}
        WEB ->> Stripe: createCheckoutSession<br/>{price_id, success_url, cancel_url}
        Stripe -->> WEB: {url: checkout.stripe.com/...}
        WEB -->> Browser: redirect URL
        Browser ->> Stripe: Checkout-Seite laden
    end

    rect rgba(45, 134, 89, 0.1)
        Note over User,DB: Phase 2: Zahlung + Bestaetigung
        User ->> Stripe: Kreditkarte / SEPA eingeben
        Stripe -->> Browser: Redirect → /success?session_id=...
        Browser ->> WEB: GET /success
        WEB ->> Stripe: retrieveCheckoutSession(session_id)
        Stripe -->> WEB: Session-Details (Status, Kunde)
        WEB -->> Browser: Bestaetigung anzeigen
    end

    rect rgba(74, 144, 217, 0.1)
        Note over Stripe,DB: Phase 3: Webhook (asynchron)
        Stripe ->> WEB: POST /api/stripe/webhook<br/>checkout.session.completed
        WEB ->> DB: Zahlung protokollieren
        WEB -->> Stripe: 200 OK
    end
```

---

### KI-Assistent (Claude Code + MCP)

Claude Code nutzt Claude Sonnet 4 mit MCP-Servern (Model Context Protocol) fuer Kubernetes-Management, Datenbank-Analyse und Browser-Automatisierung.

```mermaid
sequenceDiagram
    autonumber

    actor Admin as 👤 Administrator
    participant OC as 🧠 Claude Code<br/>ai.localhost
    participant Claude as 🤖 Claude Sonnet 4<br/>Anthropic API
    participant MCP_K as ☸️ MCP Kubernetes<br/>mcp-k8s-go
    participant K8S as ⚙️ Kubernetes API
    participant MCP_P as 🗄️ MCP Postgres
    participant DB as 💾 PostgreSQL<br/>shared-db

    rect rgba(139, 92, 246, 0.1)
        Note over Admin,DB: Phase 1: Parallele Abfrage (nur lesend)
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
        OC -->> Admin: ✅ Pod-Status + DB-Groessen anzeigen
    end

    rect rgba(217, 119, 6, 0.1)
        Note over Admin,K8S: Phase 2: Destruktive Aktion mit Genehmigung
        Admin ->> OC: "Starte Nextcloud neu"
        OC ->> Claude: Prompt + Tools
        Claude -->> OC: "Soll ich wirklich neu starten?"
        OC -->> Admin: Genehmigungsanfrage anzeigen
    end

    rect rgba(45, 134, 89, 0.1)
        Note over Admin,K8S: Phase 3: Ausfuehrung nach Genehmigung
        Admin ->> OC: Bestaetigen
        Claude ->> MCP_K: patch_deployment(nextcloud, restart)
        MCP_K ->> K8S: PATCH /apis/apps/v1/.../deployments/nextcloud
        K8S -->> MCP_K: Rollout gestartet
        MCP_K -->> Claude: Deployment neu gestartet
        Claude -->> OC: "Nextcloud wird neu gestartet"
        OC -->> Admin: ✅ Erfolgsmeldung
    end
```

**MCP-Server und Berechtigungen (RBAC):**

| MCP-Server | Protokoll | Kann | Kann nicht |
|------------|-----------|------|------------|
| mcp-kubernetes | mcp-k8s-go | Pods, Deployments, Services, Logs, Events lesen; Deployments skalieren/neustarten | Loeschen, Erstellen, Exec, Secrets lesen |
| mcp-postgres | @modelcontextprotocol/server-postgres | Alle shared-db Datenbanken abfragen (Superuser) | Schreibzugriff (per Konvention im System-Prompt) |
| mcp-browser | Playwright | URLs navigieren, Screenshots, Formulare ausfuellen | Keine Netzwerk-Beschraenkung (Cluster-intern) |
| mcp-nextcloud | ghcr.io/cbcoutinho/nextcloud-mcp-server | Dateien, Kalender, Kontakte (WebDAV/CalDAV/CardDAV) | Admin-Einstellungen |
| mcp-keycloak | quay.io/sshaaf/keycloak-mcp-server | Benutzer, Gruppen, Rollen, Sessions verwalten | Realm-Konfiguration aendern |
| mcp-github | ghcr.io/github/github-mcp-server | Repos, Issues, PRs, Code-Suche (PAT erforderlich) | Admin-Rechte |
| mcp-stripe | @stripe/agent-toolkit | Kunden, Zahlungen, Rechnungen, Abonnements | Kontoverwaltung |
| mcp-grafana | mcp-grafana | Dashboards, Panels, Annotationen lesen | Dashboard-Erstellung |
| mcp-prometheus | mcp-prometheus | PromQL-Abfragen, Metriken, Alerts lesen | Konfigurationsaenderungen |

---

### E-Mail-Zustellung (Mailpit)

Im Entwicklungsmodus faengt Mailpit alle ausgehenden E-Mails ab. In Produktion wird ein externer SMTP-Server konfiguriert.

```mermaid
flowchart LR
    NC["fa:fa-cloud Nextcloud\nnextcloud@workspace.local"] --> MP
    WEB["fa:fa-globe Website\nnoreply@workspace.local"] --> MP

    MP{{"fa:fa-envelope Mailpit\nSMTP :1025 | Web :8025"}}

    MP --> INBOX["fa:fa-inbox Web-UI\nmail.localhost\nAlle Mails einsehbar"]

    style NC fill:#1a3d28,color:#e8c870,stroke:#2a5c3a
    style WEB fill:#1a1a2e,color:#aabbcc,stroke:#2a2a4a
    style MP fill:#083344,color:#e8c870,stroke:#0e4f68
    style INBOX fill:#1a1a2e,color:#aabbcc,stroke:#2a2a4a
```

---

## Datenbank-Layout

### Uebersicht

```mermaid
erDiagram
    SHARED_DB ||--|| KC_SVC : "keycloak"
    SHARED_DB ||--|| NC_SVC : "nextcloud"
    SHARED_DB ||--|| VW_SVC : "vaultwarden"
    SHARED_DB ||--|| WEB_SVC : "website"
    SHARED_DB }|--|| MCP_PG : "alle DBs"

    SHARED_DB {
        text host "shared-db.workspace"
        text engine "PostgreSQL 16"
        text storage "25 Gi PVC"
    }
    KC_SVC { text service "Keycloak" }
    NC_SVC { text service "Nextcloud" }
    VW_SVC { text service "Vaultwarden" }
    WEB_SVC { text service "Website + Messaging" }
    MCP_PG { text service "MCP Postgres" }
```

### Datenbank-Isolation

Jede Datenbank hat einen eigenen User mit ausschliesslichem Zugriff auf seine Datenbank:

| Datenbank | User | Service | Besonderheiten |
|-----------|------|---------|----------------|
| `keycloak` | `keycloak` | Keycloak | Realm-Export als ConfigMap |
| `nextcloud` | `nextcloud` | Nextcloud | Datei-Metadaten, Kalender, Kontakte |
| `vaultwarden` | `vaultwarden` | Vaultwarden | Verschluesselte Vault-Items |
| `website` | `website` | Website (Astro) | Meeting-Pipeline, Messaging, Projektmgmt, Admin-Config — pgvector aktiviert |
| `pentest` | `pentest` | Sicherheitstests | Isolierte DB fuer Pen-Tests |

Die Init-Skripte in `shared-db` erstellen User und Datenbanken idempotent beim ersten Start und synchronisieren Passwoerter bei Neustarts.

> Die vollstaendigen Tabellenstrukturen und ER-Diagramme fuer `website` und `bachelorprojekt`
> sind in [Datenbankmodelle](database.md) dokumentiert.

---

## Namespaces

| Namespace | Zweck |
|-----------|-------|
| `workspace` | Alle Kernservices (Nextcloud, Keycloak, Vaultwarden, etc.) |
| `website` | Astro + Svelte Unternehmenswebsite |
| `argocd` | ArgoCD GitOps Controller (Produktion, Hub-Cluster) |
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
| files.localhost | nextcloud | 80 |
| office.localhost | collabora | 9980 |
| signaling.localhost | spreed-signaling | 8080 |
| meet.localhost | spreed-signaling | 8080 |
| ai.localhost | claude-code | 8080 |
| vault.localhost | vaultwarden | 80 |
| board.localhost | whiteboard | 3002 |
| mail.localhost | mailpit | 8025 |
| docs.localhost | docs | 80 |
| web.localhost | website | 4321 |

Alle Domains werden zentral in `k3d/configmap-domains.yaml` definiert.

## Persistent Storage

| PVC | Groesse | Service |
|-----|---------|---------|
| shared-db-data | 25 Gi | PostgreSQL |
| nextcloud-app | 2 Gi | Nextcloud App |
| nextcloud-data | 50 Gi | Nextcloud Dateien |
| vaultwarden-data | 5 Gi | Vaultwarden |
| backup-pvc | 1 Gi | Verschluesselte Backups |

## Deployment-Ablauf

```mermaid
flowchart TD
    A["fa:fa-server task cluster:create"] -->|k3d-config.yaml| B["fa:fa-cube k3d Cluster + Registry"]
    B --> C["fa:fa-rocket task workspace:deploy"]
    C --> D["fa:fa-cogs Namespace + ConfigMaps"]
    D --> E["fa:fa-layer-group kustomize build k3d/"]
    E --> F["fa:fa-database shared-db wartet auf Ready"]
    F --> G["fa:fa-play Alle Services parallel deployen"]
    G --> H{"fa:fa-code-branch Optionale Schritte"}

    H --> I["fa:fa-cloud task workspace:post-setup<br/>Nextcloud Apps"]
    H --> J["fa:fa-brain task mcp:deploy<br/>MCP Server Pods"]
    H --> M["fa:fa-lock task workspace:vaultwarden:seed<br/>Secret-Templates"]

    style A fill:#0a1a0a,color:#b8e8b8
    style B fill:#1a1a2e,color:#aabbcc
    style C fill:#0a1a0a,color:#b8e8b8
    style D fill:#1a1a2e,color:#aabbcc
    style E fill:#1a1a2e,color:#aabbcc
    style F fill:#1f2937,color:#aabbcc
    style G fill:#1a3d28,color:#e8c870
    style I fill:#1a3d28,color:#e8c870
    style J fill:#2a1654,color:#e8c870
    style M fill:#083344,color:#e8c870
```

Alternativ: `task workspace:up` fuer vollautomatisches Setup (Cluster + MVP + MCP + Monitoring + Billing).

## Multi-Cluster (ArgoCD GitOps)

In Produktion verwaltet ArgoCD die Deployments ueber mehrere Cluster hinweg. Ein Hub-Cluster (Hetzner) synchronisiert den Git-Zustand auf alle registrierten Cluster.

```mermaid
flowchart TB
    subgraph hub ["fa:fa-tower-broadcast Hub-Cluster (Hetzner)"]
        ARGO["fa:fa-rotate ArgoCD"]
        APPSET["ApplicationSet"]
        ARGO --> APPSET
    end

    GIT[("fa:fa-code-branch GitHub\nPaddione/Bachelorprojekt")] --> ARGO

    subgraph hetzner ["fa:fa-server Hetzner Cluster"]
        H_WS["workspace NS"]
        H_WEB["website NS"]
        H_MON["monitoring NS"]
    end

    subgraph korczewski ["fa:fa-server Korczewski Cluster"]
        K_WS["workspace NS"]
        K_WEB["website NS"]
    end

    APPSET -->|"sync"| hetzner
    APPSET -->|"sync"| korczewski

    style hub fill:#2a1654,color:#e8c870
    style hetzner fill:#0a1a0a,color:#b8e8b8
    style korczewski fill:#1b3766,color:#e8c870
    style GIT fill:#1a1a2e,color:#aabbcc
```

**Konfiguration:** Cluster-spezifische Einstellungen (Domain, Branding, Secrets) werden als Annotationen auf ArgoCD Cluster-Secrets gespeichert. Die `environments/`-Dateien definieren pro-Umgebung Variablen, die via `envsubst` in die Manifeste eingesetzt werden.

## Backup-Strategie

- **Zeitplan:** Taeglich um 02:00 UTC (CronJob)
- **Scope:** PostgreSQL-Datenbanken (keycloak, nextcloud, website)
- **Verschluesselung:** AES-256-CBC mit PBKDF2 (openssl)
- **Rotation:** 30-Tage-Aufbewahrung, aeltere Backups werden automatisch geloescht
- **Speicher:** 1 Gi PVC (`backup-pvc`)
