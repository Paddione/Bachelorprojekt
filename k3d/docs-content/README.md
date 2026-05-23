<div class="home-hero">
  <div class="home-hero-tag">Workspace MVP · Self-Hosted · Kubernetes</div>
  <h1 class="home-hero-title">Alles bleibt auf <em class="brass-accent">deinem Server</em>.</h1>
  <p class="home-hero-sub">Kubernetes-Plattform für Coaching und Beratung — Nextcloud, Keycloak, LiveKit, Claude Code, Vaultwarden. DSGVO by Design.</p>
</div>

<div class="home-stats">
  <div class="home-stat">
    <div class="home-stat-value">12</div>
    <div class="home-stat-label">Services</div>
  </div>
  <div class="home-stat">
    <div class="home-stat-value">2</div>
    <div class="home-stat-label">Cluster</div>
  </div>
  <div class="home-stat">
    <div class="home-stat-value">45+</div>
    <div class="home-stat-label">Seiten</div>
  </div>
  <div class="home-stat">
    <div class="home-stat-value">100%</div>
    <div class="home-stat-label">On-Premise</div>
  </div>
</div>

<div class="tracks">
  <a href="#/quickstart-enduser" class="track-card">
    <div class="track-bar"></div>
    <div class="track-content">
      <span class="track-label">Endnutzer</span>
      <span class="track-title">In 5 Minuten</span>
      <span class="track-desc">Login · Portal · erstes Talk-Call · Datei hochladen</span>
      <span class="track-arrow">→ Quickstart</span>
    </div>
  </a>
  <a href="#/quickstart-admin" class="track-card">
    <div class="track-bar"></div>
    <div class="track-content">
      <span class="track-label">Admin</span>
      <span class="track-title">Plattform aufsetzen</span>
      <span class="track-desc">Cluster · Workspace · Post-Setup · Backup</span>
      <span class="track-arrow">→ Quickstart</span>
    </div>
  </a>
  <a href="#/quickstart-dev" class="track-card">
    <div class="track-bar"></div>
    <div class="track-content">
      <span class="track-label">Entwickler</span>
      <span class="track-title">Codebase-Tour</span>
      <span class="track-desc">k3d · environments · Tasks · Tests</span>
      <span class="track-arrow">→ Quickstart</span>
    </div>
  </a>
</div>

## Architektur auf einen Blick

```mermaid
flowchart TB
  User([Browser])
  subgraph cluster["k3s Cluster (vereint, betreibt mentolder.de + korczewski.de)"]
    Traefik{{"Traefik Ingress · 443"}}
    subgraph identity["Identität"]
      KC[Keycloak · auth.{DOMAIN}]
    end
    subgraph collab["Zusammenarbeit"]
      NC[Nextcloud + Talk · files.{DOMAIN}]
      CO[Collabora · office.{DOMAIN}]
      WB[Whiteboard · board.{DOMAIN}]
    end
    subgraph stream["Live"]
      LK[LiveKit · livekit.{DOMAIN}]
    end
    subgraph tools["Tools"]
      VW[Vaultwarden · vault.{DOMAIN}]
      WEB[Portal · web.{DOMAIN}]
      DS[DocuSeal · sign.{DOMAIN}]
    end
    subgraph data["Daten"]
      DB[(shared-db · PG 16)]
    end
  end

  User --> Traefik
  Traefik --> KC & NC & CO & WB & LK & VW & WEB & DS
  KC -. OIDC .-> NC & VW & WEB & DS
  NC --> CO
  KC & NC & VW & WEB & DS --> DB
```

## Service-Endpunkte

`{DOMAIN}` ist `mentolder.de` oder `korczewski.de`.

| Service | URL | Beschreibung |
|---------|-----|--------------|
| Portal & Website | `https://web.{DOMAIN}` | Astro + Svelte Portal mit Chat und Buchung |
| Keycloak (SSO) | `https://auth.{DOMAIN}` | Zentrale Anmeldung (OIDC) |
| Nextcloud + Talk | `https://files.{DOMAIN}` | Dateien, Kalender, Kontakte, Talk |
| Collabora Online | `https://office.{DOMAIN}` | Office im Browser (öffnet aus Nextcloud) |
| Talk HPB | `https://signaling.{DOMAIN}` | WebRTC-Signaling für Mehrteilnehmer-Calls |
| LiveKit | `https://livekit.{DOMAIN}` · `https://stream.{DOMAIN}` | Webinare und Streams (Server + RTMP-Ingest) |
| Vaultwarden | `https://vault.{DOMAIN}` | Passwort-Manager (Bitwarden-kompatibel) |
| Whiteboard | `https://board.{DOMAIN}` | Kollaboratives Zeichnen |
| DocuSeal | `https://sign.{DOMAIN}` | E-Signatur für Verträge |
| Dokumentation | `https://docs.{DOMAIN}` | Diese Dokumentation |

> **Entwicklung:** Auf einem lokalen k3d-Cluster sind dieselben Dienste unter `*.localhost` (HTTP statt HTTPS) erreichbar. Siehe [Beitragen & CI/CD](contributing).

## Schnellstart (3 Befehle)

```bash
git clone https://github.com/Paddione/Bachelorprojekt.git
cd Bachelorprojekt
task workspace:up      # Cluster + alle Services + Post-Setup in einem Rutsch
```

Detaillierte Anleitung: [Admin-Quickstart](quickstart-admin).

## Hilfe

- [Fehlerbehebung](troubleshooting) — bekannte Probleme und Workarounds
- [Decision-Log](decisions) — warum wir Dinge so entschieden haben
- [Glossar](glossary) — Begriffe, die immer wieder vorkommen
