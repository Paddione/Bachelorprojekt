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

Workspace MVP ist eine Kubernetes-basierte Kollaborationsplattform fuer kleine Teams. Alle Services laufen als Kubernetes Deployments und werden mit Kustomize gebaut — `k3d/` ist das einzige Basis-Manifest-Verzeichnis. Lokal laeuft der Cluster in k3d (Docker-in-Docker), in Produktion laufen zwei physische k3s-Cluster: `mentolder` (9 Nodes: 3 Hetzner-CPs + 6 Home-Worker via WireGuard-Mesh, Namespace `workspace`) und `korczewski-ha` (3 Hetzner-Nodes, Namespace `workspace-korczewski`). Als Ingress Controller dient Traefik (k3s built-in), der alle eingehenden HTTP/HTTPS-Anfragen per Subdomain-Routing an die jeweiligen Services weiterleitet. Alle Nutzerdaten verbleiben vollstaendig on-premises (DSGVO by Design).

---

## Komponenten-Diagramm

> Die Service-Boxen sind klickbar und fuehren zur jeweiligen Dokumentationsseite.

```mermaid
flowchart TB
  User([Benutzer / Browser])
  subgraph mentolder["mentolder-Cluster · 9 Nodes (3 Hetzner CP + 6 Home Worker via WireGuard)"]
    direction TB
    TR1{{"Traefik · 80/443"}}
    subgraph ns1["Namespace: workspace (mentolder.de)"]
      KC1[Keycloak]
      NC1[Nextcloud + Talk]
      VW1[Vaultwarden]
      WEB1[Website + Portal]
      LK1[LiveKit]
      DB1[(shared-db · PG 16)]
      BU1[Backup CronJob]
    end
  end
  subgraph korczewski["korczewski-ha-Cluster · 3 Nodes (Hetzner)"]
    direction TB
    TR2{{"Traefik · 80/443"}}
    subgraph ns2["Namespace: workspace-korczewski (korczewski.de)"]
      KC2[Keycloak]
      NC2[Nextcloud + Talk]
      WEB2[Website + Portal]
      ARENA[Arena Server]
      DB2[(shared-db · PG 16)]
      BU2[Backup CronJob]
    end
  end

  User --> TR1 & TR2
  TR1 --> KC1 & NC1 & VW1 & WEB1 & LK1
  TR2 --> KC2 & NC2 & WEB2 & ARENA
  KC1 -. OIDC .-> NC1 & VW1 & WEB1
  KC2 -. OIDC .-> NC2 & WEB2
  KC1 & NC1 & VW1 & WEB1 --> DB1
  KC2 & NC2 & WEB2 & ARENA --> DB2
  DB1 --> BU1
  DB2 --> BU2
```

---

## Namespaces

| Namespace | Services | Pod Security Standard |
|-----------|----------|-----------------------|
| `workspace` | Keycloak, Nextcloud, Collabora, Vaultwarden, Claude Code, Mailpit, Docs, Talk HPB, Whiteboard, DocuSeal, Tracking, Whisper, Talk Transcriber, MCP-Server, shared-db | enforce: **baseline** / warn: restricted |
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
| `allow-mcp-external-egress` | Egress | mcp-github → externe HTTPS (Port 443) |

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
| `vault.localhost` | vaultwarden | 80 |
| `board.localhost` | whiteboard | 3002 |
| `sign.localhost` | docuseal | 3000 |
| `tracking.localhost` | tracking | 8000 |
| `mail.localhost` | mailpit | 8025 |
| `docs.localhost` | oauth2-proxy → docs | 80 |
| `web.localhost` | website | 4321 |

### Middlewares

In Produktion (`prod/traefik-middlewares.yaml`) sind folgende Middlewares aktiv:

- **Security-Header-Middleware** (HSTS, X-Frame-Options, CSP)
- **HTTPS-Redirect-Middleware** (HTTP → HTTPS)

Fuer interne Admin-Dienste (`mail.*`, `traefik.*`, `docs.*`) erfolgt die Zugriffskontrolle nicht mehr ueber HTTP Basic Auth, sondern ueber dedizierte `oauth2-proxy`-Instanzen mit Keycloak-SSO (ForwardAuth-Muster).

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
| `environments/` | Pro-Namespace-Variablen (mentolder, korczewski) | ArgoCD-gesteuerter Roll-out |

### Vereinter Cluster mit ArgoCD

In Produktion betreibt das Projekt einen einzigen vereinten k3s-Cluster mit 12 Nodes (6 Hetzner Control-Plane-Nodes + 6 Home-Worker-Nodes, verbunden via WireGuard-Mesh). Beide Marken (mentolder und korczewski) laufen auf demselben Cluster, getrennt nur durch Namespaces (`workspace` fuer mentolder, `workspace-korczewski` fuer korczewski). ArgoCD selbst laeuft auf den Hetzner-Nodes und synchronisiert beide Namespaces aus demselben Git-Repository. Pro-Marke-spezifische Einstellungen (Domain, Branding) werden als Annotationen auf ArgoCD Cluster-Secrets gespeichert.

```mermaid
flowchart TB
    GIT[("fa:fa-code-branch GitHub\nPaddione/Bachelorprojekt")] --> ARGO

    subgraph hub ["Vereinter k3s-Cluster (12 Nodes)"]
        ARGO["fa:fa-rotate ArgoCD\n(auf Hetzner CP)"]
        APPSET["ApplicationSet"]
        ARGO --> APPSET

        subgraph mentolder_ns ["Namespace: workspace (mentolder)"]
            M_WS["mentolder Services"]
            M_WEB["website (mentolder)"]
        end

        subgraph korczewski_ns ["Namespace: workspace-korczewski"]
            K_WS["korczewski Services"]
            K_WEB["website (korczewski)"]
        end
    end

    APPSET -->|"sync"| mentolder_ns
    APPSET -->|"sync"| korczewski_ns

    style hub fill:#2a1654,color:#e8c870
    style mentolder_ns fill:#0a1a0a,color:#b8e8b8
    style korczewski_ns fill:#1b3766,color:#e8c870
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
