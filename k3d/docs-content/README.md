# Workspace

Der Workspace ist eine selbst gehostete, Kubernetes-basierte Kollaborationsplattform für kleine Teams. Sie bündelt Dateiablage, Video-Kommunikation, Office-Suite, Passwort-Management, KI-Unterstützung und weitere Dienste hinter einem einheitlichen Single Sign-On. Alle Daten verbleiben in Deutschland auf eigenen Servern — DSGVO-konform by Design.

## Für Endnutzer

- [Benutzerhandbuch](benutzerhandbuch) — Erster Login, Portal, Nextcloud, Talk, Vaultwarden, Whiteboard
- Portal: `https://web.mentolder.de/portal` bzw. `https://web.korczewski.de/portal`

## Für Administratoren

- [Adminhandbuch](adminhandbuch) — Betrieb, Benutzerverwaltung, Backups, Updates
- [Admin-Webinterface](admin-webinterface) — Vollständige Referenz aller Admin-Bereiche
- [Projekt-Verwaltung](admin-projekte) — Projekte, Teilprojekte, Aufgaben, Gantt

## Service-Endpunkte (Produktion)

`{DOMAIN}` ist `mentolder.de` oder `korczewski.de`.

| Service | URL | Beschreibung |
|---------|-----|--------------|
| Portal & Website | `https://web.{DOMAIN}` | Astro + Svelte Portal mit Chat, Buchung, Rechnungen |
| Keycloak (SSO) | `https://auth.{DOMAIN}` | Zentrale Anmeldung (OIDC) |
| Nextcloud | `https://files.{DOMAIN}` | Dateien, Kalender, Kontakte, Talk |
| Collabora Online | `https://office.{DOMAIN}` | Office im Browser (öffnet aus Nextcloud) |
| Talk HPB | `https://signaling.{DOMAIN}` | WebRTC-Signaling für Videocalls |
| LiveKit Stream | `https://livekit.{DOMAIN}` · `https://stream.{DOMAIN}` | Livestream / Webinare (Server + RTMP-Ingest) |
| Vaultwarden | `https://vault.{DOMAIN}` | Passwort-Manager (Bitwarden-kompatibel) |
| Whiteboard | `https://board.{DOMAIN}` | Kollaboratives Zeichnen |
| DocuSeal | `https://sign.{DOMAIN}` | E-Signatur für Verträge |
| Dokumentation | `https://docs.{DOMAIN}` | Diese Dokumentation |
| Whisper | (intern) | Automatische Transkription |
| Claude Code | (Plattform-Backend) | KI-Assistent über MCP-Server |

> **Entwicklung:** Auf einem lokalen k3d-Cluster sind dieselben Dienste unter `*.localhost` (HTTP statt HTTPS) erreichbar. Details: [Beitragen & CI/CD](contributing).

## Schnellstart (Entwicklung)

Voraussetzungen: [Docker](https://www.docker.com/), [k3d](https://k3d.io), [kubectl](https://kubernetes.io/docs/tasks/tools/), [task](https://taskfile.dev).

```bash
git clone https://github.com/Paddione/Bachelorprojekt.git
cd Bachelorprojekt
task workspace:up      # Cluster erstellen + alle Services deployen
```

Schrittweise:

```bash
task cluster:create        # k3d-Cluster anlegen
task workspace:deploy      # Alle Services deployen (Kustomize)
task workspace:post-setup  # Nextcloud-Apps aktivieren (Kalender, Kontakte, OIDC, Collabora)
```

## Architektur

```mermaid
graph TB
    subgraph Internet
        User(["fa:fa-user Benutzer / Browser"])
    end

    subgraph k3d-Cluster ["fa:fa-server k3d/k3s Cluster"]
        Traefik["fa:fa-globe Traefik Ingress<br/>Ports 80 / 443"]

        subgraph workspace ["fa:fa-cubes Namespace: workspace"]
            KC["fa:fa-key Keycloak<br/>auth.localhost"]
            NC["fa:fa-cloud Nextcloud + Talk<br/>files.localhost"]
            CO["fa:fa-file-word Collabora Online<br/>office.localhost"]
            HPB["fa:fa-video Talk HPB Signaling<br/>signaling.localhost"]
            VW["fa:fa-lock Vaultwarden<br/>vault.localhost"]
            WB["fa:fa-chalkboard Whiteboard<br/>board.localhost"]
            DS["fa:fa-file-signature DocuSeal<br/>sign.localhost"]
            TR["fa:fa-list-check Tracking<br/>tracking.localhost"]
            MP["fa:fa-envelope Mailpit<br/>mail.localhost"]
            DOCS["fa:fa-file-lines Docs<br/>docs.localhost"]
            OAUTH2["oauth2-proxy-docs"]
            WHISPER["fa:fa-microphone Whisper<br/>intern"]
            TRBOT["fa:fa-closed-captioning Talk Transcriber"]

            subgraph HPB-Stack ["fa:fa-video Talk HPB Stack"]
                JANUS["Janus Gateway"]
                NATS["NATS"]
                COTURN["coturn TURN/STUN"]
            end

            DB[("fa:fa-database PostgreSQL 16<br/>shared-db")]
        end

        subgraph website-ns ["Namespace: website"]
            WEB["fa:fa-globe Website Astro<br/>web.localhost"]
        end
    end

    User --> Traefik
    Traefik --> KC & NC & CO & HPB & VW & WB & DS & TR & MP & WEB
    Traefik --> OAUTH2
    OAUTH2 --> DOCS

    KC -. OIDC .-> NC & VW & WEB & DS & TR
    OAUTH2 --> KC

    NC --> CO
    NC --> HPB
    HPB --- JANUS & NATS
    HPB --> TRBOT
    JANUS --- COTURN

    KC & NC & VW & DS & TR --> DB
    WEB --> DB

    classDef identity fill:#4a90d9,color:#fff,stroke:#2d6a9f
    classDef collab fill:#2d8659,color:#fff,stroke:#1a5c3a
    classDef ai fill:#8b5cf6,color:#fff,stroke:#6d3ad4
    classDef data fill:#6b7280,color:#fff,stroke:#4b5563
    classDef tools fill:#0891b2,color:#fff,stroke:#0e7490
    classDef infra fill:#374151,color:#fff,stroke:#1f2937

    class KC,OAUTH2 identity
    class NC,CO,WB,HPB,JANUS,NATS,COTURN collab
    class WHISPER,TRBOT ai
    class DB data
    class VW,MP,DOCS,DS,TR tools
    class Traefik,WEB infra
```

## SSO-Ablauf

```mermaid
sequenceDiagram
    autonumber

    participant U as Benutzer
    participant S as Service<br/>(Nextcloud / Vaultwarden / etc.)
    participant KC as Keycloak
    participant DB as PostgreSQL

    rect rgba(74, 144, 217, 0.1)
        U->>S: Zugriff auf geschützte Seite
        S->>KC: Redirect zu /auth (OIDC Authorization Request)
        KC->>U: Login-Formular
        U->>KC: Credentials eingeben
    end

    rect rgba(45, 134, 89, 0.1)
        KC->>DB: Credentials prüfen
        DB-->>KC: OK
        KC->>U: Redirect zurück mit Authorization Code
    end

    rect rgba(139, 92, 246, 0.1)
        U->>S: Authorization Code
        S->>KC: Token-Austausch (Code + Access Token + ID Token)
        KC-->>S: Tokens
        S->>S: Benutzer anlegen / Session erstellen
        S-->>U: Zugriff gewährt
    end
```

## Deployment-Ablauf

```mermaid
flowchart LR
    A["fa:fa-server task cluster:create"] --> B["fa:fa-rocket task workspace:deploy"]
    B --> C{"fa:fa-code-branch Optionale Schritte"}
    C --> D["fa:fa-brain task mcp:deploy<br/>MCP-Server"]
    C --> E["fa:fa-cloud task workspace:post-setup<br/>Nextcloud Apps"]
    C --> G["fa:fa-lock task workspace:vaultwarden:seed<br/>Secret-Templates"]

    style A fill:#2d6a4f,color:#fff
    style B fill:#2d6a4f,color:#fff
    style D fill:#8b5cf6,color:#fff
    style E fill:#2d8659,color:#fff
    style G fill:#0891b2,color:#fff
```

Alternativ alles automatisch: `task workspace:up`

## Dokumentationsstruktur

| Abschnitt | Beschreibung |
|-----------|-------------|
| [Architektur](architecture) | Systemübersicht, Datenfluss, Netzwerk |
| [Services](services) | Kubernetes-Services und ihr Zusammenspiel |
| [Keycloak & SSO](keycloak) | Identity Management, OIDC-Clients, Realm-Konfiguration |
| [Datenbank](database) | PostgreSQL-Schema, Datenbankzugriffe |
| [Sicherheit](security) | Sicherheitsrichtlinien, TLS, Secrets-Management |
| [Skripte](scripts) | Referenz aller Bash-Skripte und Parameter |
| [DSGVO](dsgvo) | Datenschutz, Datensouveränität, Compliance-Prüfung |
| [Administration](adminhandbuch) | Betrieb, Monitoring, Backup, Troubleshooting |
