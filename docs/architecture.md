# Architektur

## Systemuebersicht

Workspace MVP ist eine Kubernetes-basierte Kollaborationsplattform fuer kleine Teams. Alle Services laufen als Deployments in einem k3d/k3s Cluster mit Traefik als Ingress Controller. Daten bleiben vollstaendig on-premises (DSGVO by Design).

```mermaid
graph TB
    subgraph Internet
        User([Benutzer / Browser])
    end

    subgraph k3d["k3d/k3s Cluster"]
        Traefik["Traefik Ingress<br/>Ports 80 / 443"]

        subgraph workspace ["Namespace: workspace"]
            KC[Keycloak<br/>auth.localhost]
            MM[Mattermost<br/>chat.localhost]
            NC[Nextcloud + Talk<br/>files.localhost]
            CO[Collabora Online<br/>office.localhost]
            OC[OpenClaw AI<br/>ai.localhost]
            IN[Invoice Ninja<br/>billing.localhost]
            VW[Vaultwarden<br/>vault.localhost]
            WB[Whiteboard<br/>board.localhost]
            MP[Mailpit<br/>mail.localhost]
            OS[OpenSearch]
            DOCS[Docs<br/>docs.localhost]
            BB[billing-bot]
            WHISPER[Whisper]

            subgraph hpb ["Talk HPB Stack"]
                SIG[spreed-signaling<br/>signaling.localhost]
                JANUS[Janus Gateway]
                NATS[NATS]
                COTURN[coturn]
            end

            subgraph proxies ["Auth Proxies"]
                PROXY[mm-keycloak-proxy]
                OAUTH[oauth2-proxy<br/>Invoice Ninja]
            end

            DB[(PostgreSQL 16<br/>shared-db)]
            MARIA[(MariaDB 11<br/>Invoice Ninja)]
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
    Traefik --> KC & MM & NC & CO & SIG & OC & OAUTH & VW & WB & MP & DOCS & WEB

    KC -. OIDC .-> MM & NC & IN & OC & VW

    PROXY --> KC
    MM --> PROXY
    OAUTH --> KC
    OAUTH --> IN

    MM <--> BB <--> IN
    NC --> CO
    NC --> SIG
    SIG --- JANUS & NATS
    JANUS --- COTURN
    MM --> OS

    KC & MM & NC & VW & OC --> DB
    IN --> MARIA
    PROM -.-> GRAF
```

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

## Datenbank-Layout

Ein geteilter PostgreSQL 16 Cluster (`shared-db`) hostet mehrere Datenbanken:

```mermaid
erDiagram
    SHARED-DB {
        string keycloak "Keycloak Realm + Users"
        string mattermost "Chat, Channels, Messages"
        string nextcloud "Files, Calendar, Contacts"
        string vaultwarden "Encrypted Vault Items"
        string outline "Wiki Pages + Documents"
    }
    MARIADB {
        string invoiceninja "Invoices, Clients, Products"
    }
```

Invoice Ninja verwendet eine separate MariaDB 11 Instanz, da es MySQL/MariaDB erfordert.

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
| ai.localhost | openclaw | 8080 |
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
| openclaw-data | 2 Gi | OpenClaw AI Daten |
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
