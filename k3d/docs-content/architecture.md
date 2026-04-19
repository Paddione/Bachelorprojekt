<div class="page-hero">
  <span class="page-hero-icon">🏗️</span>
  <div class="page-hero-body">
    <div class="page-hero-title">Systemarchitektur</div>
    <p class="page-hero-desc">Kubernetes-Cluster-Topologie, Service-Abhaengigkeiten, Netzwerkmodell und Infrastruktur-Design des Workspace MVP.</p>
    <div class="page-hero-meta">
      <span class="page-hero-tag">Fuer Administratoren</span>
      <span class="page-hero-tag">Kubernetes</span>
      <span class="page-hero-tag">Mermaid-Diagramme</span>
    </div>
  </div>
  <a href="#/" class="page-hero-back">← Uebersicht</a>
</div>

# Systemarchitektur

## Ueberblick

Workspace MVP ist eine Kubernetes-basierte Kollaborationsplattform fuer kleine Teams. Alle Services laufen als Kubernetes Deployments und werden mit Kustomize gebaut — `k3d/` ist das einzige Basis-Manifest-Verzeichnis. Lokal laeuft der Cluster in k3d (Docker-in-Docker), in Produktion auf k3s (Hetzner/Korczewski). Als Ingress Controller dient Traefik (k3s built-in), der alle eingehenden HTTP/HTTPS-Anfragen per Subdomain-Routing an die jeweiligen Services weiterleitet. Alle Nutzerdaten verbleiben vollstaendig on-premises (DSGVO by Design).

---

## Komponenten-Diagramm

> Die Service-Boxen sind klickbar und fuehren zur jeweiligen Dokumentationsseite.

```mermaid
flowchart TB
    User([fa:fa-user Benutzer / Browser])

    subgraph cluster ["fa:fa-server k3d/k3s Cluster"]
        direction TB
        Traefik{{"fa:fa-globe Traefik Ingress\n80 / 443"}}

        subgraph identity ["fa:fa-shield-halved Identitaet"]
            KC["fa:fa-key Keycloak\nauth.localhost"]
            OAUTH2["oauth2-proxy\n(Docs-Schutz)"]
        end

        subgraph collaboration ["fa:fa-users Zusammenarbeit"]
            NC["fa:fa-cloud Nextcloud + Talk\nfiles.localhost"]
            CO["fa:fa-file-word Collabora Online\noffice.localhost"]
            WB["fa:fa-chalkboard Whiteboard\nboard.localhost"]
            REC["fa:fa-record-vinyl Talk Recording"]
        end

        subgraph video ["fa:fa-video Talk HPB Stack"]
            SIG["spreed-signaling\nsignaling.localhost"]
            JANUS["Janus Gateway\n(coturn NS)"]
            NATS["NATS"]
            COTURN["coturn\n(coturn NS)"]
        end

        subgraph ai ["fa:fa-robot KI & Automatisierung"]
            OC["fa:fa-brain Claude Code\nai.localhost"]
            WHISPER["fa:fa-microphone Whisper\n(optional)"]
            MCP["MCP-Server\n(k8s, pg, browser,\nnc, kc, github)"]
        end

        subgraph tools ["fa:fa-toolbox Werkzeuge"]
            VW["fa:fa-lock Vaultwarden\nvault.localhost"]
            MP["fa:fa-envelope Mailpit\nmail.localhost"]
            DOCS["fa:fa-file-lines Docs\ndocs.localhost"]
        end

        subgraph data ["fa:fa-database Datenhaltung"]
            DB[("PostgreSQL 16\nshared-db\n5 Datenbanken")]
        end

        subgraph website_ns ["Namespace: website"]
            WEB["fa:fa-globe Website\nAstro + Svelte\nweb.localhost"]
        end
    end

    %% Ingress
    User --> Traefik
    Traefik --> KC & NC & CO & SIG & OC & VW & WB & MP & OAUTH2 & WEB
    OAUTH2 --> DOCS

    %% OIDC
    KC -. "OIDC" .-> NC & OC & VW & WEB
    OAUTH2 --> KC

    %% Zusammenarbeit
    NC --> CO
    NC --> SIG
    NC --> REC
    NC -. "WOPI" .-> CO
    SIG --- NATS
    SIG --> JANUS
    JANUS --- COTURN

    %% KI
    OC --> MCP
    NC -. "optional" .-> WHISPER

    %% Datenbanken
    KC --> DB
    NC --> DB
    VW --> DB
    WEB --> DB

    %% SMTP
    NC -. "SMTP" .-> MP
    WEB -. "SMTP" .-> MP

    %% Klickbare Nodes
    click KC "#/keycloak" "Keycloak: Zentraler OIDC Identity Provider. Verwaltet Benutzer, Rollen und OIDC-Clients."
    click NC "#/services?id=nextcloud-dateien-talk" "Nextcloud: Dateiverwaltung, Kalender, Kontakte, Talk-Videokonferenzen."
    click CO "#/services?id=collabora-online-office" "Collabora Online: LibreOffice-basierter Browser-Editor via WOPI."
    click OC "#/services?id=claude-code-ki-assistent" "Claude Code: KI-Assistent mit MCP-Servern fuer Cluster-Management."
    click VW "#/services?id=vaultwarden-passwoerter" "Vaultwarden: Self-hosted Bitwarden-kompatibler Passwort-Manager."
    click WB "#/services?id=whiteboard" "Whiteboard: Echtzeit-Kollaborations-Whiteboard."
    click MP "#/services?id=mailpit-dev-mail" "Mailpit: SMTP-Testserver fuer Entwicklung."
    click DB "#/architecture?id=datenbankmodell" "PostgreSQL 16: 5 isolierte Datenbanken mit eigenem User je Service."
    click WEB "#/services?id=website-astro-svelte" "Website: Astro + Svelte mit Messaging, OIDC-Login und Admin-Panel."
    click WHISPER "#/services?id=whisper-transkription-optional" "Whisper: faster-whisper Audio-zu-Text Transkription."
    click SIG "#/services?id=talk-hpb-signaling" "spreed-signaling: WebRTC-Signaling-Server fuer Nextcloud Talk."

    %% Styles
    classDef identity_style fill:#1b3766,color:#e8c870,stroke:#2a5291
    classDef collab_style fill:#1a3d28,color:#e8c870,stroke:#2a5c3a
    classDef ai_style fill:#2a1654,color:#e8c870,stroke:#3d2478
    classDef data_style fill:#1f2937,color:#aabbcc,stroke:#374151
    classDef tools_style fill:#083344,color:#e8c870,stroke:#0e4f68
    classDef infra_style fill:#1a1a2e,color:#aabbcc,stroke:#2a2a4a

    class KC,OAUTH2 identity_style
    class NC,CO,WB,REC collab_style
    class OC,MCP,WHISPER ai_style
    class DB data_style
    class VW,MP,DOCS tools_style
    class Traefik,WEB infra_style
```

---

## Namespaces

| Namespace | Services | Pod Security Standard |
|-----------|----------|-----------------------|
| `workspace` | Keycloak, Nextcloud, Collabora, Vaultwarden, Claude Code, Mailpit, Docs, Talk HPB, Whiteboard, Whisper, MCP-Server, shared-db | enforce: **baseline** / warn: restricted |
| `website` | Astro + Svelte Website (Messaging, Admin-Panel) | Standard |
| `workspace-office` | Collabora Online (eigener Namespace wegen privilegierten Containern) | Privileged |
| `coturn` | Janus Gateway, NATS, coturn (eigener Namespace, hostNetwork) | Privileged |
| `argocd` | ArgoCD GitOps Controller (Hub-Cluster, Produktion) | Standard |
| `cert-manager` | cert-manager, lego DNS-01 Webhook (Produktion, TLS) | Standard |
| `kube-system` | Traefik Ingress Controller (k3s built-in) | System |

Der `workspace`-Namespace hat Pod Security Standards konfiguriert:

- **enforce: baseline** -- Mindestanforderungen werden erzwungen (keine privilegierten Container, kein hostNetwork)
- **warn: restricted** -- Warnungen bei Verstoss gegen strengere Richtlinien (read-only Root-FS, non-root User)

Collabora und der coturn-Stack laufen in eigenen Namespaces, weil sie privilegierte Container oder `hostNetwork: true` benoetigen und nicht unter die `namespace: workspace`-Direktive von Kustomize fallen duerfen.

---

## Netzwerkarchitektur

### NetworkPolicy-Modell

Der `workspace`-Namespace setzt ein **Default-Deny-Modell** (Ingress und Egress) um. Jede Verbindung muss explizit erlaubt sein.

| Policy | Richtung | Erlaubtes |
|--------|----------|-----------|
| `default-deny-ingress` | Ingress | Alle eingehenden Verbindungen blockieren (Default) |
| `default-deny-egress` | Egress | Alle ausgehenden Verbindungen blockieren (Default) |
| `allow-dns-egress` | Egress | DNS (Port 53 UDP/TCP) zu `kube-system` |
| `allow-intra-namespace-egress` | Egress | Pod-zu-Pod innerhalb `workspace` |
| `allow-intra-namespace-ingress` | Ingress | Pod-zu-Pod innerhalb `workspace` |
| `allow-traefik-ingress` | Ingress | Traefik-Pod aus `kube-system` |
| `allow-traefik-egress` | Egress | Traefik-Pod aus `kube-system` (Port 8443/8000, fuer interne HTTPS-Calls) |
| `allow-internet-egress` | Egress | Internet (0.0.0.0/0 ausser RFC-1918) |
| `allow-website-ingress` | Ingress | Pods aus `website`/`korczewski-website` |
| `allow-collabora-egress` | Egress | Nextcloud → Collabora (Port 9980, `workspace-office` NS) |
| `allow-signaling-coturn-egress` | Egress | spreed-signaling → Janus (Port 8188, `coturn` NS + Node-IP) |
| `allow-transcriber-to-website-egress` | Egress | talk-transcriber → Website-Service (Port 80/4321) |
| `allow-mcp-external-egress` | Egress | mcp-github, mcp-stripe → externe HTTPS (Port 443) |

### Kommunikationsmatrix

```mermaid
flowchart LR
    subgraph kube_sys ["kube-system"]
        TR["Traefik"]
    end

    subgraph ws ["workspace"]
        KC["Keycloak"]
        NC["Nextcloud"]
        CO_PROXY["(→ office NS)"]
        SIG["spreed-signaling"]
        OC["Claude Code"]
        VW["Vaultwarden"]
        DB["shared-db"]
        TRX["talk-transcriber"]
    end

    subgraph office ["workspace-office"]
        CO["Collabora"]
    end

    subgraph ct ["coturn"]
        JANUS["Janus"]
    end

    subgraph web_ns ["website"]
        WEB["Website"]
    end

    TR -->|"Ingress"| ws
    ws -->|"OIDC"| KC
    NC -->|"WOPI :9980"| CO
    SIG -->|"WS :8188"| JANUS
    TRX -->|"HTTP :80/4321"| WEB
    WEB -->|"Ingress"| ws

    style kube_sys fill:#1a1a2e,color:#aabbcc
    style ws fill:#0a1a0a,color:#b8e8b8
    style office fill:#1b3766,color:#e8c870
    style ct fill:#1b3766,color:#e8c870
    style web_ns fill:#2a1654,color:#e8c870
```

---

## Ingress & Routing

Traefik ist der einzige Ingress Controller (k3s built-in, im `kube-system`-Namespace). Das Routing erfolgt ausschliesslich per **Subdomain (Host-Header)**. Alle Hostnamen sind zentral in `k3d/configmap-domains.yaml` definiert.

| Host | Service | Port |
|------|---------|------|
| `auth.localhost` | keycloak | 8080 |
| `files.localhost` | nextcloud | 80 |
| `office.localhost` | collabora | 9980 |
| `signaling.localhost` | spreed-signaling | 8080 |
| `meet.localhost` | spreed-signaling | 8080 |
| `ai.localhost` | claude-code | 8080 |
| `vault.localhost` | vaultwarden | 80 |
| `board.localhost` | whiteboard | 3002 |
| `mail.localhost` | mailpit | 8025 |
| `docs.localhost` | oauth2-proxy → docs | 80 |
| `web.localhost` | website | 4321 |

### Middlewares

In der Entwicklungsumgebung (`k3d/traefik-middlewares-dev.yaml`) ist eine einzige Middleware aktiv:

- **`basic-auth-internal`** -- HTTP Basic Auth fuer interne Dienste (Secret `traefik-basic-auth`)

In Produktion (`prod/traefik-middlewares.yaml`) kommen zusaetzlich hinzu:

- **Security-Header-Middleware** (HSTS, X-Frame-Options, CSP)
- **HTTPS-Redirect-Middleware** (HTTP → HTTPS)

---

## Datenbankmodell

Eine einzige PostgreSQL-16-Instanz (`shared-db`) bedient alle Services. Jeder Service hat eine isolierte Datenbank mit eigenem Datenbankbenutzer ohne Cross-DB-Berechtigungen.

| Datenbank | DB-User | Service | Besonderheiten |
|-----------|---------|---------|----------------|
| `keycloak` | `keycloak` | Keycloak | Realm-Config via ConfigMap importiert |
| `nextcloud` | `nextcloud` | Nextcloud | Datei-Metadaten, Kalender, Kontakte |
| `vaultwarden` | `vaultwarden` | Vaultwarden | Verschluesselte Vault-Items |
| `website` | `website` | Website (Astro) | Messaging, Meetings, Projekte, Admin-Config |
| `pentest` | `pentest` | Sicherheitstests (CTF) | Isolierte DB mit Pentest-Flag-Daten |

Init-Skripte in `shared-db` erstellen Datenbanken und User idempotent beim ersten Start und synchronisieren Passwoerter bei Neustarts aus den Kubernetes Secrets.

> Vollstaendige Tabellenstrukturen und ER-Diagramme sind in [Datenbankmodelle](database.md) dokumentiert.

---

## Konfigurationsarchitektur

### Zentrale Konfigurationspunkte

| Datei / Ressource | Inhalt | Gilt fuer |
|-------------------|--------|-----------|
| `k3d/configmap-domains.yaml` | Alle Hostnamen (KC, NC, CO, ...) | Alle Services (per ConfigMap-Ref) |
| `k3d/secrets.yaml` | Dev-Credentials (nur Entwicklung) | Lokales k3d |
| `k3d/realm-workspace-dev.json` | Keycloak Realm-Export | Keycloak-Import via Init-Container |
| `k3d/nextcloud-oidc-dev.php` | Nextcloud OIDC-Client-Config | Nextcloud |
| `.env` | `PROD_DOMAIN`, `BRAND_NAME`, `CONTACT_EMAIL` | envsubst bei Prod-Deployment |
| `prod/` | Kustomize-Overlays (TLS, Ressource-Limits, Replicas) | Produktion |
| `environments/` | Pro-Cluster-Variablen (Hetzner, Korczewski) | ArgoCD Multi-Cluster |

### Multi-Cluster mit ArgoCD

In Produktion verwaltet ArgoCD (Hub-Cluster auf Hetzner) die Deployments ueber mehrere Cluster. Ein ApplicationSet synchronisiert den Git-Zustand auf alle registrierten Ziel-Cluster. Cluster-spezifische Einstellungen (Domain, Branding) werden als Annotationen auf ArgoCD Cluster-Secrets gespeichert.

```mermaid
flowchart TB
    GIT[("fa:fa-code-branch GitHub\nPaddione/Bachelorprojekt")] --> ARGO

    subgraph hub ["Hub-Cluster (Hetzner)"]
        ARGO["fa:fa-rotate ArgoCD"]
        APPSET["ApplicationSet"]
        ARGO --> APPSET
    end

    subgraph hetzner ["Hetzner Cluster"]
        H_WS["workspace NS"]
        H_WEB["website NS"]
    end

    subgraph korczewski ["Korczewski Cluster"]
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

---

## SSO / OIDC-Flow

Keycloak ist der zentrale Identity Provider. Alle Services (Nextcloud, Vaultwarden, Claude Code, Website, Docs) authentifizieren ueber OpenID Connect (Authorization Code Flow). Docs wird zusaetzlich durch oauth2-proxy vorgeschaltet.

```mermaid
sequenceDiagram
    autonumber

    actor User as Benutzer
    participant Browser as Browser
    participant Service as Service<br/>(Nextcloud / Website / ...)
    participant KC as Keycloak<br/>auth.localhost
    participant DB as PostgreSQL<br/>keycloak DB

    rect rgba(74, 144, 217, 0.1)
        Note over User,DB: Phase 1 — Redirect zum Identity Provider
        User ->> Browser: Geschuetzte Seite oeffnen
        Browser ->> Service: GET /
        Service -->> Browser: 302 Redirect → auth.localhost
        Browser ->> KC: /realms/workspace/protocol/openid-connect/auth
        KC ->> DB: Client-Konfiguration pruefen
        DB -->> KC: Client-Config
        KC -->> Browser: Login-Formular
    end

    rect rgba(45, 134, 89, 0.1)
        Note over User,DB: Phase 2 — Authentifizierung
        User ->> Browser: Zugangsdaten eingeben
        Browser ->> KC: POST Login
        KC ->> DB: Benutzer validieren
        DB -->> KC: Benutzer + Rollen
        KC -->> Browser: 302 Redirect + Authorization Code
    end

    rect rgba(139, 92, 246, 0.1)
        Note over Browser,KC: Phase 3 — Token-Austausch (Standard OIDC)
        Browser ->> Service: Callback mit Authorization Code
        Service ->> KC: Token-Austausch (direkt, server-side)
        KC -->> Service: Access Token + ID Token
        Service ->> KC: Userinfo (optional)
        KC -->> Service: User Claims (Name, E-Mail, Rollen)
    end

    Service -->> Browser: Session erstellt, Dashboard laden
    Browser -->> User: Eingeloggt
```

**Registrierte OIDC-Clients im Realm `workspace`:**

| Client | Service | Besonderheiten |
|--------|---------|----------------|
| `nextcloud` | Nextcloud | Groups-Claim fuer NC-Gruppen-Sync |
| `claude-code` | Claude Code | PKCE |
| `vaultwarden` | Vaultwarden | SSO-Login |
| `website` | Website (Astro) | PKCE, Messaging-Berechtigungen |
| `docs` | Docs (via oauth2-proxy) | Nur lesender Zugriff |

---

## Deployment-Pipeline

```mermaid
flowchart TD
    DEV["fa:fa-code Entwickler\ngit push"] --> CI

    subgraph CI ["GitHub Actions CI"]
        direction LR
        KUST["kustomize build\n+ kubeconform"]
        YAML["yamllint\n(200 Zeichen)"]
        SHELL["shellcheck\nalle Scripts"]
        JSON["JSON / PHP\nValidierung"]
        SEC["Secret-Detection\nImage-Pinning"]
    end

    CI -->|"PR erstellen"| PR["Pull Request\n(squash-merge)"]
    PR -->|"Merge"| MAIN["main Branch"]

    MAIN -->|"lokal: task workspace:deploy"| K3D["k3d Cluster\n(Entwicklung)"]
    MAIN -->|"ArgoCD sync"| PROD["k3s Cluster\n(Produktion)"]

    subgraph K3D_STEPS ["k3d Deployment-Schritte"]
        direction TB
        S1["Namespace + ConfigMaps"] --> S2["kustomize build k3d/"]
        S2 --> S3["shared-db wartet auf Ready"]
        S3 --> S4["Alle Services deployen"]
        S4 --> S5["task workspace:post-setup\n(Nextcloud Apps)"]
        S5 --> S6["task mcp:deploy\n(MCP-Server)"]
    end

    K3D --> K3D_STEPS

    style DEV fill:#1a1a2e,color:#aabbcc
    style CI fill:#0a1a0a,color:#b8e8b8
    style PR fill:#1a3d28,color:#e8c870
    style MAIN fill:#2a1654,color:#e8c870
    style K3D fill:#083344,color:#e8c870
    style PROD fill:#083344,color:#e8c870
```

**CI-Pruefungen (`.github/workflows/ci.yml`) bei jedem Pull Request:**

- **Manifest-Validierung:** `kustomize build` + `kubeconform` (Kubernetes 1.31.0)
- **YAML-Linting:** `yamllint` (max. 200 Zeichen pro Zeile)
- **Shell-Linting:** `shellcheck` auf alle `.sh`-Scripts
- **Config-Validierung:** JSON (Realm-Export), PHP (OIDC-Config)
- **Sicherheitspruefungen:** Secret-Detection, Image-Pinning-Check

---

## Persistenter Speicher

| PVC | Groesse | Service |
|-----|---------|---------|
| `shared-db-pvc` | 25 Gi | PostgreSQL 16 |
| `nextcloud-app` | 2 Gi | Nextcloud Applikation |
| `nextcloud-data` | 50 Gi | Nextcloud Nutzerdaten |
| `vaultwarden-data` | 5 Gi | Vaultwarden Vault |
| `backup-pvc` | 1 Gi | Verschluesselte Datenbank-Backups |

### Backup-Strategie

- **Zeitplan:** Taeglich um 02:00 UTC (Kubernetes CronJob)
- **Scope:** PostgreSQL-Datenbanken (keycloak, nextcloud, website)
- **Verschluesselung:** AES-256-CBC mit PBKDF2 (openssl)
- **Rotation:** 30-Tage-Aufbewahrung, aeltere Backups werden automatisch geloescht
- **Speicher:** 1 Gi PVC (`backup-pvc`)
