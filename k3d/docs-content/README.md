<div class="page-hero">
  <span class="page-hero-icon">🏠</span>
  <div class="page-hero-body">
    <div class="page-hero-title">Workspace · Dokumentation</div>
    <p class="page-hero-desc">Alles, was du zum Verstehen, Aufsetzen und Betreiben des Workspace brauchst — auf deinem Server, DSGVO by Design.</p>
    <div class="page-hero-meta">
      <span class="page-hero-tag">Self-Hosted</span>
      <span class="page-hero-tag">DSGVO</span>
      <span class="page-hero-tag">Kubernetes</span>
    </div>
  </div>
</div>

# Workspace — alles bleibt auf <em>deinem Server</em>.

<p class="kicker">Startseite · Wähl deinen Einstieg</p>

Workspace ist eine selbstgehostete Plattform für Coaching, Beratung und Office-Arbeit: Dateien, Talk, Kalender, KI-Assistenz, Passwörter — alles auf deiner Hardware, alles unter einem Single-Sign-On. Drei Einstiegswege:

<div class="tracks">
  <a href="#/quickstart-enduser" class="track-card">
    <span class="lab">Endnutzer</span>
    <span class="ti">In 5 Minuten</span>
    <span class="de">Login · Portal · erstes Talk-Call · Datei hochladen</span>
    <span class="arrow">→ Quickstart</span>
  </a>
  <a href="#/quickstart-admin" class="track-card">
    <span class="lab">Admin</span>
    <span class="ti">Plattform aufsetzen</span>
    <span class="de">Cluster · Workspace · Post-Setup · Backup</span>
    <span class="arrow">→ Quickstart</span>
  </a>
  <a href="#/quickstart-dev" class="track-card">
    <span class="lab">Entwickler</span>
    <span class="ti">Codebase-Tour</span>
    <span class="de">k3d · environments · Tasks · Tests</span>
    <span class="arrow">→ Quickstart</span>
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
