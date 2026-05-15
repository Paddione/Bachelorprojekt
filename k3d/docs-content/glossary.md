<div class="page-hero">
  <span class="page-hero-icon">📖</span>
  <div class="page-hero-body">
    <div class="page-hero-title">Glossar</div>
    <p class="page-hero-desc">Begriffe, die im Workspace immer wieder vorkommen — kurz erklärt.</p>
  </div>
  <a href="#/" class="page-hero-back">← Übersicht</a>
</div>

# Glossar

<p class="kicker">Referenz · Begriffe von A bis Z</p>

## B

**Brand** — Visuelles Identitätsset. Workspace betreibt zwei Brands: `mentolder` und `korczewski`. Erscheint als `BRAND_ID`-ConfigMap und steuert Theme/Logo/Texte in Website und Docs.

**Backup** — Tägliche Postgres-Dumps via `db-backup` CronJob; Restore über `task workspace:restore`. Siehe [Backup & Wiederherstellung](backup).

## C

**Collabora** — Office-Suite (Word, Excel, PowerPoint) im Browser. Öffnet Dokumente aus Nextcloud. Eigene Subdomain `office.{DOMAIN}`. Siehe [Collabora (Office)](collabora).

**ConfigMap** — Kubernetes-Ressource für unverschlüsselte Konfiguration (z. B. `docs-content`, `realm-template`). Geheimnisse gehören in `Secret` / `SealedSecret`.

## D

**Docsify** — JS-basierter Markdown-Renderer. Lädt `index.html` und alle `*.md` aus `k3d/docs-content/` zur Laufzeit im Browser. Kein Build-Schritt.

**DSGVO** — Datenschutz-Grundverordnung. Kernprinzip des Workspace: alle Daten bleiben on-premises. Siehe [DSGVO / Datenschutz](dsgvo).

## E

**ENV** — Eine Umgebung wie `dev`, `mentolder`, `korczewski`. Steuert Cluster-Kontext, Sealed Secret und Kustomize-Overlay. Wird Tasks via `ENV=mentolder` mitgegeben.

## H

**HPB (High-Performance Backend)** — Talk-Signaling-Server (Janus + NATS). Wird benötigt für Mehrteilnehmer-Calls. Eigene Subdomain `signaling.{DOMAIN}`. Siehe [Talk HPB (Signaling)](talk-hpb).

## I

**Ingress** — Traefik (k3s built-in). Routet HTTP/HTTPS nach Subdomain an die richtigen Services.

## K

**k3d** — k3s in Docker. Lokaler Single-Node-Cluster für Entwicklung. Konfiguration: `k3d-config.yaml`.

**k3s** — Lightweight Kubernetes von Rancher. Läuft in Produktion (Hetzner-Nodes + Home-Worker via WireGuard).

**Keycloak** — Identity Provider. Realm `workspace`. Alle Services authentifizieren über OIDC. Siehe [Keycloak (SSO)](keycloak).

**Kustomize** — Manifest-Builder. Base in `k3d/`, Overlays in `prod-mentolder/` / `prod-korczewski/`.

## L

**LiveKit** — WebRTC-Server für Webinare und Livestreams. Läuft mit `hostNetwork: true` und Node-Pinning. Siehe [Livestream (LiveKit)](livestream).

## M

**MCP (Model Context Protocol)** — Protokoll für Claude-Code-Erweiterungen. Workspace betreibt einen MCP-Monolith mit Postgres-, Browser-, GitHub-, Keycloak- und Kubernetes-Servern. Siehe [MCP-Server (Claude Code)](claude-code).

**Mermaid** — Markdown-Diagramm-Sprache. Wird in Docsify gerendert; pro Brand eigene Themen-Variablen.

## N

**Nextcloud** — Selbstgehostete Cloud (Dateien, Kalender, Kontakte, Talk). Subdomain `files.{DOMAIN}`. Siehe [Nextcloud + Talk](nextcloud).

## O

**OIDC** — OpenID Connect. Authentifizierungs-Layer auf OAuth 2.0. Keycloak ist der Provider; Clients sind Nextcloud, Vaultwarden, Website, DocuSeal, Tracking, MCP-Server.

**Overlay** — Kustomize-Verzeichnis, das die Base patcht. `prod-mentolder/` und `prod-korczewski/` sind die zwei produktiven Overlays.

## P

**Portal** — Frontend-Sektion der Website unter `/portal`. Authentifizierter Bereich für Endnutzer mit Dashboard, Chat, Buchung.

**Post-Setup** — Schritte nach `task workspace:deploy`: Nextcloud-Apps aktivieren, OIDC verdrahten, Talk-Signaling konfigurieren. Siehe [Quickstart Admin](quickstart-admin).

## S

**SealedSecret** — Verschlüsseltes Secret, das im Repo committed werden darf. Der Sealed-Secrets-Controller im Cluster entschlüsselt zur Laufzeit zu einem normalen `Secret`.

**SSO (Single Sign-On)** — Einmaliger Login deckt alle Workspace-Services ab. Implementiert via Keycloak + OIDC.

**shared-db** — Zentrale PostgreSQL-16-Instanz im Cluster. Pro Service eine eigene Datenbank (`keycloak`, `nextcloud`, `vaultwarden`, `website`, `docuseal`, `tracking`). Siehe [PostgreSQL (shared-db)](shared-db).

## T

**Talk** — Nextcloud Talk: Chat, Audio-/Videocalls, integriert in Nextcloud. Mehrteilnehmer-Calls via HPB.

**Taskfile** — Task-Runner-Konfiguration (`taskfile.dev`). Single-Source-of-Truth für alle Build-/Deploy-/Ops-Befehle.

## V

**Vaultwarden** — Bitwarden-kompatibler Passwort-Manager. Subdomain `vault.{DOMAIN}`. Siehe [Vaultwarden (Passwörter)](vaultwarden).

## W

**Whiteboard** — Excalidraw-basiertes kollaboratives Zeichenbrett. Subdomain `board.{DOMAIN}`. Siehe [Whiteboard](whiteboard).

**Whisper** — OpenAI-Whisper-basierter Transkriptions-Service. Talk-Transcriber-Bot nutzt ihn für Live-Untertitel.

**WireGuard** — VPN-Mesh, das Home-Worker-Nodes mit dem Hetzner-Cluster verbindet. Hub: `pk-hetzner`.

**Workspace** — Die Plattform als Ganzes; auch der Kubernetes-Namespace (`workspace` für mentolder, `workspace-korczewski` für korczewski).
