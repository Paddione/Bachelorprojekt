# Deutsche Dokumentation von Grund auf — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alle Markdown-Dateien in `k3d/docs-content/` vollständig neu schreiben und neue Dateien hinzufügen — umfassende, korrekte, deutschsprachige Dokumentation für das Workspace MVP.

**Architecture:** Docsify-Site, statisch geserved aus Kubernetes ConfigMap (`docs-content`). Dateien liegen flach in `k3d/docs-content/`. `kustomization.yaml` listet jede Datei explizit. `_sidebar.md` steuert die Docsify-Navigation.

**Tech Stack:** Markdown, Mermaid (Diagramme), Docsify, Kustomize ConfigMap

---

## Schreibprinzipien (für alle Tasks)

- **Sprache:** Deutsch. Fachbegriffe (Deployment, Pod, ConfigMap, OIDC, etc.) bleiben auf Englisch.
- **Ton:** Sachlich, präzise. Kein Marketing.
- **Diagramme:** Mermaid wo sinnvoll (Architektur, Flows, Sequenzen).
- **Template für Service-Dateien:** `## Übersicht` → `## Konfiguration` → `## Betrieb` → `## Fehlerbehebung`
- **Umgebungshinweise:** Unterschiede Dev/Prod mit `> **Produktion:**` oder `> **Entwicklung:**` kennzeichnen.
- **Genauigkeit:** Nur was im Repository existiert. Keine erfundenen Features. Vor dem Schreiben die genannten Quelldateien lesen.
- **Keine HTML-Blöcke:** Kein benutzerdefiniertes HTML (kein `<div class="page-hero">`). Reines Markdown.

---

## Task 1: kustomization.yaml — Neue Datei-Einträge hinzufügen

**Files:**
- Modify: `k3d/kustomization.yaml`

- [ ] **Schritt 1: Aktuelle ConfigMap-Einträge lesen**

```bash
grep -A 50 "name: docs-content" /home/patrick/Bachelorprojekt/k3d/kustomization.yaml
```

- [ ] **Schritt 2: Alle neuen Dateien eintragen**

Im Block `configMapGenerator` → `name: docs-content` → `files:` folgende Einträge **hinzufügen** (zusätzlich zu den bestehenden):

```yaml
      - docs-content/nextcloud.md
      - docs-content/collabora.md
      - docs-content/talk-hpb.md
      - docs-content/claude-code.md
      - docs-content/vaultwarden.md
      - docs-content/website.md
      - docs-content/whiteboard.md
      - docs-content/mailpit.md
      - docs-content/whisper.md
      - docs-content/monitoring.md
      - docs-content/shared-db.md
      - docs-content/operations.md
      - docs-content/environments.md
      - docs-content/argocd.md
      - docs-content/backup.md
      - docs-content/dsgvo.md
      - docs-content/contributing.md
```

Bestehende Einträge behalten: `README.md`, `_sidebar.md`, `architecture.md`, `database.md` (→ wird zu `shared-db.md`, aber alter Eintrag kann bleiben), `benutzerhandbuch.md`, `adminhandbuch.md`, `keycloak.md`, `mcp-actions.md` (→ geht in `claude-code.md` auf, Eintrag entfernen), `migration.md`, `requirements.md`, `scripts.md`, `security-report.md`, `security.md`, `services.md` (→ nicht mehr nötig, Eintrag entfernen), `test-anleitung-korczewski.md`, `tests.md`, `troubleshooting.md`, `verarbeitungsverzeichnis.md`, `stripe.md` (→ entfernen), `admin-projekte.md`.

Entfernen: `mcp-actions.md`, `services.md`, `stripe.md` (nicht mehr genutzt).

- [ ] **Schritt 3: Validieren**

```bash
cd /home/patrick/Bachelorprojekt && task workspace:validate 2>&1 | tail -5
```

Erwartetes Ergebnis: Keine Fehler (oder Warnungen nur für noch nicht existierende Dateien — das ist OK, die werden in späteren Tasks erstellt).

- [ ] **Schritt 4: Commit**

```bash
git add k3d/kustomization.yaml
git commit -m "chore: add new docs-content entries to kustomization"
```

---

## Task 2: `_sidebar.md` — Docsify-Navigation

**Files:**
- Modify: `k3d/docs-content/_sidebar.md`

- [ ] **Schritt 1: Bestehende Sidebar lesen**

```bash
cat /home/patrick/Bachelorprojekt/k3d/docs-content/_sidebar.md
```

- [ ] **Schritt 2: Sidebar komplett neu schreiben**

Datei `k3d/docs-content/_sidebar.md` mit folgendem Inhalt überschreiben:

```markdown
- **Einführung**
  - [Startseite](README)
  - [Systemarchitektur](architecture)

- **Services**
  - [Keycloak (SSO)](keycloak)
  - [Nextcloud (Dateien & Talk)](nextcloud)
  - [Collabora (Office)](collabora)
  - [Talk HPB (Signaling)](talk-hpb)
  - [Claude Code (KI & MCP)](claude-code)
  - [Vaultwarden (Passwörter)](vaultwarden)
  - [Website (Astro & Svelte)](website)
  - [Whiteboard](whiteboard)
  - [Mailpit (Dev-Mail)](mailpit)
  - [Whisper (Transkription)](whisper)
  - [Monitoring (Prometheus & Grafana)](monitoring)
  - [PostgreSQL (shared-db)](shared-db)

- **Betrieb**
  - [Deployment & Taskfile](operations)
  - [Umgebungen](environments)
  - [ArgoCD (GitOps)](argocd)
  - [Backup & Wiederherstellung](backup)

- **Sicherheit**
  - [Sicherheitsarchitektur](security)
  - [Sicherheitsbericht](security-report)
  - [DSGVO / Datenschutz](dsgvo)
  - [Verarbeitungsverzeichnis](verarbeitungsverzeichnis)

- **Tests**
  - [Testframework & Test-IDs](tests)

- **Benutzerhandbuch**
  - [Für Endnutzer](benutzerhandbuch)

- **Administration**
  - [Adminhandbuch](adminhandbuch)
  - [Projekt-Verwaltung](admin-projekte)

- **Entwicklung**
  - [Beitragen & CI/CD](contributing)
  - [Skripte-Referenz](scripts)
  - [Migration](migration)
  - [Anforderungen](requirements)
  - [Fehlerbehebung](troubleshooting)
```

- [ ] **Schritt 3: Commit**

```bash
git add k3d/docs-content/_sidebar.md
git commit -m "docs: rewrite sidebar navigation"
```

---

## Task 3: `README.md` — Startseite

**Files:**
- Modify: `k3d/docs-content/README.md`

**Quelldateien lesen:**
```bash
cat /home/patrick/Bachelorprojekt/README.md
cat /home/patrick/Bachelorprojekt/k3d/configmap-domains.yaml
```

- [ ] **Schritt 1: README.md neu schreiben**

Datei `k3d/docs-content/README.md` mit folgendem **Struktur** schreiben (Inhalt aus Quelldateien ableiten):

```markdown
# Workspace MVP

[Einleitungssatz: Was ist das, für wen ist es, Bachelorarbeit-Kontext]

## Schnellstart

[Voraussetzungen, git clone, task workspace:up]

## Service-Endpunkte

| Service | URL (Dev) | URL (Prod) | Beschreibung |
|---------|-----------|------------|--------------|
[Alle Services aus README.md — ohne Invoice Ninja/billing-bot/Stripe]

## Architektur

[Mermaid-Diagramm aus README.md übernehmen, aktualisieren:
 - Invoice Ninja, billing-bot entfernen
 - Website-Namespace korrekt einzeichnen
 - monitoring-Namespace ergänzen]

## SSO-Ablauf

[Sequenz-Diagramm aus README.md übernehmen]

## Deployment-Ablauf

[Flowchart aus README.md übernehmen, Invoice Ninja/billing entfernen]
```

- [ ] **Schritt 2: Commit**

```bash
git add k3d/docs-content/README.md
git commit -m "docs: rewrite README startpage"
```

---

## Task 4: `architecture.md` — Systemarchitektur

**Files:**
- Modify: `k3d/docs-content/architecture.md`

**Quelldateien lesen:**
```bash
cat /home/patrick/Bachelorprojekt/k3d/kustomization.yaml
cat /home/patrick/Bachelorprojekt/k3d/network-policies.yaml
cat /home/patrick/Bachelorprojekt/k3d/ingress.yaml
cat /home/patrick/Bachelorprojekt/k3d/configmap-domains.yaml
cat /home/patrick/Bachelorprojekt/k3d/namespace.yaml
```

- [ ] **Schritt 1: architecture.md neu schreiben**

Struktur:

```markdown
# Systemarchitektur

## Überblick
[2-3 Sätze: k3s/k3d, Kustomize, Traefik, Namespace-Modell]

## Komponenten-Diagramm
[Vollständiges Mermaid-Diagramm aller Services mit Namespaces:
 workspace, website, monitoring. Verbindungen: OIDC, DB, interne APIs]

## Namespaces
[Tabelle: namespace → Services → Pod Security Standard]

## Netzwerkarchitektur
[NetworkPolicies: Default-Deny, erlaubte Verbindungen, Egress-Regeln]

## Ingress & Routing
[Traefik als IngressController, Subdomain-Routing, Middlewares]

## Datenbankmodell
[shared-db: eine PostgreSQL-Instanz, separate Datenbanken pro Service, Tabelle mit DB-Namen]

## SSO / OIDC-Flow
[Sequenz-Diagramm: Benutzer → Service → Keycloak → Token → Zugriff]

## Konfigurationsarchitektur
[Zentrale Domains (configmap-domains.yaml), Secrets, Env-Substitution, Sealed Secrets]

## Deployment-Pipeline
[Flowchart: git push → CI → kustomize build → k3d/ArgoCD deploy]
```

- [ ] **Schritt 2: Commit**

```bash
git add k3d/docs-content/architecture.md
git commit -m "docs: rewrite architecture documentation"
```

---

## Task 5: `keycloak.md` — SSO & Identity Management

**Files:**
- Modify: `k3d/docs-content/keycloak.md`

**Quelldateien lesen:**
```bash
cat /home/patrick/Bachelorprojekt/k3d/keycloak.yaml
cat /home/patrick/Bachelorprojekt/k3d/realm-workspace-dev.json | python3 -m json.tool | head -100
cat /home/patrick/Bachelorprojekt/k3d/realm-import-entrypoint.sh
cat /home/patrick/Bachelorprojekt/k3d/oauth2-proxy-docs.yaml
```

- [ ] **Schritt 1: keycloak.md neu schreiben**

Struktur:

```markdown
# Keycloak — Identity Provider & SSO

## Übersicht
[Rolle im System, OIDC-Provider für alle Services, URL, Image-Version]

## Realm-Konfiguration
[Realm "workspace", automatischer Import beim Start, Einstellungen:
 SSL-Modus (none/dev, external/prod), Registrierung, Brute-Force-Schutz,
 Passwort-Policy]

## OIDC-Clients
[Mermaid-Diagramm: Keycloak → alle OIDC-Clients]
[Tabelle: Client-ID | Service | Redirect-URI | Besonderheiten]
Clients: nextcloud, vaultwarden, claude-code (ai), website/chat, oauth2-proxy-docs

## SSO-Flow
[Sequenz-Diagramm: User → Service → Keycloak → DB → Token → Zugriff]

## Admin-Zugang
[URLs Dev/Prod, Credentials Dev: admin/devadmin, Prod: Sealed Secret]

## Benutzerverwaltung
[User anlegen, Rollen zuweisen, Gruppen]

## Realm-Import & Konfiguration
[realm-workspace-dev.json als ConfigMap, import-entrypoint.sh, envsubst]

## Betrieb
[task workspace:logs -- keycloak, task workspace:restart -- keycloak,
 task workspace:psql -- keycloak]

## Fehlerbehebung
[Häufige Probleme: OIDC-Redirect fehlschlägt, Realm nicht importiert,
 Admin-Passwort vergessen]
```

- [ ] **Schritt 2: Commit**

```bash
git add k3d/docs-content/keycloak.md
git commit -m "docs: rewrite Keycloak documentation"
```

---

## Task 6: `nextcloud.md` — Dateien, Kalender & Talk

**Files:**
- Create: `k3d/docs-content/nextcloud.md`

**Quelldateien lesen:**
```bash
cat /home/patrick/Bachelorprojekt/k3d/nextcloud.yaml
cat /home/patrick/Bachelorprojekt/k3d/nextcloud-oidc-dev.php
cat /home/patrick/Bachelorprojekt/k3d/nextcloud-extra-config.php
cat /home/patrick/Bachelorprojekt/k3d/nextcloud-notify-push-ingress.yaml
cat /home/patrick/Bachelorprojekt/k3d/nextcloud-redis.yaml
```

- [ ] **Schritt 1: nextcloud.md schreiben**

Struktur:

```markdown
# Nextcloud — Dateiverwaltung, Kalender & Talk

## Übersicht
[Funktionen: Dateien, Kalender, Kontakte, Talk (Video/Chat), Whiteboard-Integration.
 URL, Image-Version. Abhängigkeiten: PostgreSQL, Redis, Collabora, Talk HPB]

## Aktivierte Apps
[Tabelle: App | Funktion | Aktiviert via]
calendar, contacts, oidc, collabora, whiteboard, notify_push, talk

## OIDC-Integration
[Keycloak als Provider, nextcloud-oidc-dev.php, Client-ID, User-Mapping]

## Redis-Cache
[notify_push Performance-Cache, nextcloud-redis.yaml]

## Collabora-Integration
[WOPI-URL, wie Nextcloud Collabora aufruft]

## Talk / Video-Calls
[HPB-Signaling, TURN/STUN, Aufzeichnung (talk-recording), Transkription (whisper)]

## Konfiguration
[nextcloud-extra-config.php: trusted_domains, mail, log-Level]

## Betrieb
[task workspace:post-setup, occ-Befehle via kubectl exec,
 task workspace:logs -- nextcloud]

## Fehlerbehebung
[Datei-Upload-Fehler, Talk-Video funktioniert nicht, OIDC-Login fehlschlägt]
```

- [ ] **Schritt 2: Commit**

```bash
git add k3d/docs-content/nextcloud.md
git commit -m "docs: add Nextcloud documentation"
```

---

## Task 7: `collabora.md` — Office Suite

**Files:**
- Create: `k3d/docs-content/collabora.md`

**Quelldateien lesen:**
```bash
cat /home/patrick/Bachelorprojekt/k3d/office-stack/
ls /home/patrick/Bachelorprojekt/k3d/office-stack/ 2>/dev/null || grep -r "collabora" /home/patrick/Bachelorprojekt/k3d/kustomization.yaml
grep -l "collabora\|CODE" /home/patrick/Bachelorprojekt/k3d/*.yaml | head -5
```

- [ ] **Schritt 1: Relevante Manifeste identifizieren und lesen**

```bash
grep -rl "collabora\|CODE\|office" /home/patrick/Bachelorprojekt/k3d/ --include="*.yaml" | head -5
cat /home/patrick/Bachelorprojekt/k3d/office-stack/*.yaml 2>/dev/null || \
  grep -B2 -A20 "collabora" /home/patrick/Bachelorprojekt/k3d/nextcloud.yaml | head -40
```

- [ ] **Schritt 2: collabora.md schreiben**

Struktur:

```markdown
# Collabora Online — Office Suite

## Übersicht
[Collabora CODE als WOPI-Backend für Nextcloud. Kein eigenes UI (antwortet mit "OK").
 URL: office.localhost (nur intern). Image-Version]

## WOPI-Integration
[Wie Nextcloud → Collabora: WOPI-Protokoll, URL-Konfiguration]

## Unterstützte Formate
[Writer, Calc, Impress — ODF + Microsoft Office Formate]

## Konfiguration
[Umgebungsvariablen, trusted domains, aliasgroup]

## Betrieb
[Starten, Neustart, Logs. Hinweis: kein UI erreichbar — nur "OK" als Antwort]

## Fehlerbehebung
[Nextcloud zeigt "Collabora nicht erreichbar", SSL-Fehler, trusted domain Fehler]
```

- [ ] **Schritt 3: Commit**

```bash
git add k3d/docs-content/collabora.md
git commit -m "docs: add Collabora documentation"
```

---

## Task 8: `talk-hpb.md` — Signaling & WebRTC

**Files:**
- Create: `k3d/docs-content/talk-hpb.md`

**Quelldateien lesen:**
```bash
cat /home/patrick/Bachelorprojekt/k3d/talk-hpb.yaml
cat /home/patrick/Bachelorprojekt/k3d/talk-recording.yaml
ls /home/patrick/Bachelorprojekt/k3d/coturn-stack/ 2>/dev/null && \
  cat /home/patrick/Bachelorprojekt/k3d/coturn-stack/*.yaml 2>/dev/null
grep -r "coturn\|TURN\|STUN\|janus\|nats" /home/patrick/Bachelorprojekt/k3d/talk-hpb.yaml | head -20
```

- [ ] **Schritt 1: talk-hpb.md schreiben**

Struktur:

```markdown
# Talk HPB — Signaling & WebRTC

## Übersicht
[High-Performance Backend für Nextcloud Talk. Komponenten: Janus Gateway,
 NATS Message Broker, coturn TURN/STUN Server. URL: signaling.localhost]

## Architektur
[Mermaid-Diagramm: Nextcloud Talk → HPB → Janus Gateway ↔ NATS ↔ coturn ↔ Browser]

## Komponenten
### Janus Gateway
[WebRTC Media Server, Ports, Konfiguration]
### NATS
[Message Broker für Signaling, interne Kommunikation]
### coturn
[TURN/STUN Server für NAT-Traversal, Ports (3478/UDP+TCP, 5349)]

## Konfiguration
[Secrets: TURN-Credentials, HPB-Shared-Secret mit Nextcloud]

## Talk Recording
[talk-recording.yaml, Aufzeichnungsformat, Speicherort in Nextcloud]

## Betrieb
[Starten, Logs, Neu starten]

## Fehlerbehebung
[Video-Call funktioniert nicht, TURN-Server nicht erreichbar, coturn-Logs]
```

- [ ] **Schritt 2: Commit**

```bash
git add k3d/docs-content/talk-hpb.md
git commit -m "docs: add Talk HPB signaling documentation"
```

---

## Task 9: `claude-code.md` — KI & MCP-Server

**Files:**
- Modify: `k3d/docs-content/claude-code.md` (neu erstellen — ersetzt `mcp-actions.md`)

**Quelldateien lesen:**
```bash
ls /home/patrick/Bachelorprojekt/k3d/claude-code-mcp-*.yaml
cat /home/patrick/Bachelorprojekt/k3d/claude-code-config.yaml
cat /home/patrick/Bachelorprojekt/k3d/claude-code-rbac.yaml
cat /home/patrick/Bachelorprojekt/claude-code/system-prompt.md
cat /home/patrick/Bachelorprojekt/k3d/docs-content/mcp-actions.md
```

- [ ] **Schritt 1: claude-code.md schreiben**

Struktur:

```markdown
# Claude Code — KI-Assistent & MCP-Server

## Übersicht
[Claude Code als KI-Assistent im Workspace. URL: ai.localhost (MCP-Status-Dashboard).
 Läuft lokal auf dem Entwicklerrechner; MCP-Server laufen als Pods im Cluster]

## MCP-Server-Übersicht
[Tabelle aller 13 MCP-Server: Name | Pod/Container | Funktion]
Aus den 13 claude-code-mcp-*.yaml Dateien ableiten:
core, apps, auth, browser, github, grafana, kubernetes, ops, postgres, prometheus, stripe (→ entfernen wenn weg)

## RBAC & Kubernetes-Zugriff
[claude-code-rbac.yaml: ServiceAccount, ClusterRole, ClusterRoleBinding.
 Was Claude Code im Cluster darf/nicht darf]

## MCP-Aktionskatalog
[Aus mcp-actions.md übernehmen und aktualisieren:
 Welche Aktionen welcher MCP-Server ausführt — geordnet nach Server]

## Konfiguration
[claude-code-config.yaml: system-prompt, Modell-Einstellungen]

## Betrieb
[task mcp:deploy, task mcp:status, task mcp:logs, task mcp:restart,
 task mcp:select, task mcp:set-github-pat]

## Fehlerbehebung
[MCP-Pod nicht bereit, Kubernetes-Zugriff verweigert, Claude Code verbindet nicht]
```

- [ ] **Schritt 2: Commit**

```bash
git add k3d/docs-content/claude-code.md
git commit -m "docs: add Claude Code + MCP documentation"
```

---

## Task 10: `vaultwarden.md` — Passwort-Manager

**Files:**
- Create: `k3d/docs-content/vaultwarden.md`

**Quelldateien lesen:**
```bash
grep -A 80 "vaultwarden" /home/patrick/Bachelorprojekt/k3d/kustomization.yaml | head -30
ls /home/patrick/Bachelorprojekt/k3d/vaultwarden*.yaml 2>/dev/null
cat /home/patrick/Bachelorprojekt/k3d/vaultwarden-seed-credentials.yaml 2>/dev/null | head -40
```

- [ ] **Schritt 1: Manifest-Dateien lesen**

```bash
for f in /home/patrick/Bachelorprojekt/k3d/vaultwarden*.yaml; do echo "=== $f ==="; head -40 "$f"; done
```

- [ ] **Schritt 2: vaultwarden.md schreiben**

Struktur:

```markdown
# Vaultwarden — Passwort-Manager

## Übersicht
[Bitwarden-kompatibler Passwort-Manager. URL: vault.localhost / vault.korczewski.de.
 Alle Bitwarden-Clients kompatibel. OIDC über Keycloak]

## OIDC-Integration
[Keycloak als SSO-Provider, Client-ID: vaultwarden, Konfiguration]

## Seed-Jobs
[vaultwarden-seed-credentials.yaml: Automatisches Befüllen mit Secret-Templates.
 task workspace:vaultwarden:seed, task workspace:vaultwarden:seed-logs]

## Secret-Templates
[Was wird geseedet: Produktions-Credentials als Templates (ohne echte Werte)]

## Bitwarden-Client-Zugang
[Server-URL setzen: https://vault.korczewski.de, Login mit Workspace-Account]

## Betrieb
[Logs, Neustart, Admin-Panel: /admin]

## Fehlerbehebung
[OIDC-Login fehlschlägt, Seed-Job schlägt fehl, Client verbindet nicht]
```

- [ ] **Schritt 3: Commit**

```bash
git add k3d/docs-content/vaultwarden.md
git commit -m "docs: add Vaultwarden documentation"
```

---

## Task 11: `website.md` — Astro + Svelte Website

**Files:**
- Create: `k3d/docs-content/website.md`

**Quelldateien lesen:**
```bash
cat /home/patrick/Bachelorprojekt/k3d/website.yaml | head -60
ls /home/patrick/Bachelorprojekt/website/src/ 2>/dev/null | head -20
cat /home/patrick/Bachelorprojekt/website/package.json 2>/dev/null | python3 -m json.tool | grep -E '"name"|"scripts"|"dependencies"' | head -20
ls /home/patrick/Bachelorprojekt/korczewski-website/ 2>/dev/null | head -10
```

- [ ] **Schritt 1: website.md schreiben**

Struktur:

```markdown
# Website — Astro + Svelte

## Übersicht
[Zwei Instanzen: mentolder.de (Coaching-Plattform) + korczewski.de (Branding-Variante).
 URL Dev: web.localhost. Tech-Stack: Astro (SSR) + Svelte (interaktive Komponenten)]

## Funktionen
[Chat/Messaging (eingebaut in die Website), SSO via Keycloak, PostgreSQL direkt]

## Verzeichnisstruktur
[website/ → mentolder, korczewski-website/ → korczewski Variante]

## Lokale Entwicklung
[task website:dev → Astro Dev-Server auf localhost mit Hot-Reload]

## Build & Deploy
[task website:build → Docker-Image
 task website:build:import → in k3d importieren
 task website:deploy → Namespace website deployen
 task website:redeploy → alles auf einmal]

## Umgebungen
[Dev: web.localhost, Prod-mentolder: web.mentolder.de, Prod-korczewski: web.korczewski.de]

## Betrieb
[task website:status, task website:logs, task website:restart]

## Fehlerbehebung
[Build schlägt fehl, Seite lädt nicht, Chat funktioniert nicht]
```

- [ ] **Schritt 2: Commit**

```bash
git add k3d/docs-content/website.md
git commit -m "docs: add Website documentation"
```

---

## Task 12: `whiteboard.md` + `mailpit.md` — Hilfsdienste

**Files:**
- Create: `k3d/docs-content/whiteboard.md`
- Create: `k3d/docs-content/mailpit.md`

**Quelldateien lesen:**
```bash
cat /home/patrick/Bachelorprojekt/k3d/mailpit.yaml | head -50
grep -r "whiteboard" /home/patrick/Bachelorprojekt/k3d/ --include="*.yaml" | head -10
cat /home/patrick/Bachelorprojekt/k3d/whiteboard*.yaml 2>/dev/null | head -50
```

- [ ] **Schritt 1: whiteboard.md schreiben**

```markdown
# Whiteboard — Kollaboratives Zeichnen

## Übersicht
[WebSocket-Backend für Nextcloud Whiteboard App. URL: board.localhost.
 Kein eigenständiges UI — wird ausschließlich von Nextcloud genutzt]

## Integration
[Nextcloud Whiteboard App verbindet sich mit board.localhost,
 Konfiguration in Nextcloud Admin-Panel]

## Betrieb
[Logs, Neustart]
```

- [ ] **Schritt 2: mailpit.md schreiben**

```markdown
# Mailpit — Entwicklungs-Mailserver

## Übersicht
[Lokaler SMTP-Server + Web-UI für E-Mail-Testing. URL: mail.localhost.
 Nur in der Entwicklungsumgebung aktiv — kein echter Mailversand]

## Nutzung
[Alle Services (Keycloak, Nextcloud) senden E-Mails an Mailpit.
 Web-UI unter mail.localhost zeigt alle eingegangenen Mails]

## Konfiguration
[SMTP-Endpunkt: mailpit:1025 (intern), Web-UI: Port 8025]

## In Tests
[SA-06 und andere Tests nutzen Mailpit zur E-Mail-Verifikation]

## Betrieb
[Nur Dev: nicht in Prod-Overlays vorhanden]
```

- [ ] **Schritt 3: Commit**

```bash
git add k3d/docs-content/whiteboard.md k3d/docs-content/mailpit.md
git commit -m "docs: add Whiteboard and Mailpit documentation"
```

---

## Task 13: `whisper.md` — Transkription

**Files:**
- Create: `k3d/docs-content/whisper.md`

**Quelldateien lesen:**
```bash
cat /home/patrick/Bachelorprojekt/k3d/talk-transcriber.yaml 2>/dev/null | head -60
ls /home/patrick/Bachelorprojekt/k3d/talk-transcriber/ 2>/dev/null
cat /home/patrick/Bachelorprojekt/k3d/whisper.yaml 2>/dev/null | head -60
```

- [ ] **Schritt 1: whisper.md schreiben**

Struktur:

```markdown
# Whisper — Sprach-Transkription

## Übersicht
[faster-whisper als Transkriptions-Service für Nextcloud Talk.
 Optional — nur bei Bedarf deployen. Intern im Cluster, kein Ingress]

## Komponenten
[Whisper (faster-whisper), Talk Transcriber (Nextcloud Talk Integration)]

## Deployment
[task whisper:deploy, task whisper:status, task whisper:logs]

## Integration mit Talk
[Wie Nextcloud Talk → Transkriptions-Service: Protokoll, Konfiguration]

## Ressourcen
[GPU-Worker (docker-compose.gpu-worker.yaml für externe GPU-Beschleunigung, optional)]

## Betrieb
[Starten, Logs, Modell-Wechsel]
```

- [ ] **Schritt 2: Commit**

```bash
git add k3d/docs-content/whisper.md
git commit -m "docs: add Whisper transcription documentation"
```

---

## Task 14: `monitoring.md` — Prometheus & Grafana

**Files:**
- Create: `k3d/docs-content/monitoring.md`

**Quelldateien lesen:**
```bash
ls /home/patrick/Bachelorprojekt/grafana/ 2>/dev/null
cat /home/patrick/Bachelorprojekt/grafana/*.json 2>/dev/null | head -30
grep -r "prometheus\|grafana\|monitoring" /home/patrick/Bachelorprojekt/k3d/ --include="*.yaml" -l
grep -r "prometheus\|grafana" /home/patrick/Bachelorprojekt/Taskfile.yml | head -20
```

- [ ] **Schritt 1: monitoring.md schreiben**

Struktur:

```markdown
# Monitoring — Prometheus & Grafana

## Übersicht
[Prometheus (Metriken-Scraping) + Grafana (Visualisierung) im Namespace monitoring.
 Deployment: task workspace:monitoring / task observability:install]

## DSGVO-Compliance-Dashboard
[Grafana-Dashboard für DSGVO-Anforderungen (NFA-01), grafana/ Verzeichnis]

## Deployment
[task workspace:monitoring oder task observability:install,
 task observability:remove zum Entfernen]

## Zugriff
[Grafana URL: grafana.localhost (Dev) / grafana.korczewski.de (Prod),
 Prometheus URL: prometheus.localhost]

## Metriken
[Welche Services werden gescraped: Keycloak, Nextcloud, PostgreSQL, etc.]

## DSGVO-Dashboard
[Zweck: NFA-01 Compliance-Nachweis. Dashboards für:
 - Image-Herkunft (keine Cloud-Registries)
 - Netzwerk-Egress-Überwachung
 - Privilegierte Container]

## Betrieb
[Neustart, Logs, Dashboard importieren]
```

- [ ] **Schritt 2: Commit**

```bash
git add k3d/docs-content/monitoring.md
git commit -m "docs: add Monitoring documentation"
```

---

## Task 15: `shared-db.md` — PostgreSQL

**Files:**
- Modify: `k3d/docs-content/database.md` → inhaltlich ersetzen, aber Datei `shared-db.md` neu erstellen

Da `database.md` in `kustomization.yaml` verbleibt, die bestehende Datei mit einem Weiterleitungshinweis überschreiben und `shared-db.md` als neue Hauptdatei anlegen.

**Quelldateien lesen:**
```bash
cat /home/patrick/Bachelorprojekt/k3d/shared-db.yaml
cat /home/patrick/Bachelorprojekt/k3d/backup-cronjob.yaml
cat /home/patrick/Bachelorprojekt/k3d/backup-pvc.yaml
grep "psql\|shared-db\|postgres" /home/patrick/Bachelorprojekt/Taskfile.yml | head -20
```

- [ ] **Schritt 1: shared-db.md schreiben**

Struktur:

```markdown
# PostgreSQL — Gemeinsame Datenbank (shared-db)

## Übersicht
[Eine PostgreSQL 16 Instanz für alle Services. Jeder Service hat eine eigene
 Datenbank und eigene Credentials. Cluster-intern, kein Ingress]

## Datenbanken pro Service
| Datenbank | Service | Migrations |
|-----------|---------|------------|
[Aus shared-db.yaml und Service-Manifesten ableiten: keycloak, nextcloud, vaultwarden, website, ...]

## Verbindung (Entwicklung)
[task workspace:psql -- <db>, task workspace:port-forward → localhost:5432]

## TLS
[Opportunistisches TLS mit selbst-signierten Zertifikaten, bei jedem Neustart neu generiert]

## Backup
[backup-cronjob.yaml: Zeitplan, PVC, Verschlüsselung. Siehe auch backup.md]

## Betrieb
[Logs, Neustart, Speicherverbrauch prüfen]

## Fehlerbehebung
[Verbindung schlägt fehl, Datenbank nicht vorhanden, Speicher voll]
```

- [ ] **Schritt 2: database.md aktualisieren (Weiterleitung)**

```bash
cat > /home/patrick/Bachelorprojekt/k3d/docs-content/database.md << 'EOF'
# Datenbank

> Diese Seite wurde zu [PostgreSQL (shared-db)](shared-db) verschoben.
EOF
```

- [ ] **Schritt 3: Commit**

```bash
git add k3d/docs-content/shared-db.md k3d/docs-content/database.md
git commit -m "docs: add PostgreSQL shared-db documentation"
```

---

## Task 16: `operations.md` — Deployment & Taskfile-Referenz

**Files:**
- Create: `k3d/docs-content/operations.md`

**Quelldateien lesen:**
```bash
cat /home/patrick/Bachelorprojekt/Taskfile.yml
cat /home/patrick/Bachelorprojekt/README.md | grep -A 300 "Vollständige Task-Referenz"
```

- [ ] **Schritt 1: operations.md schreiben**

Struktur:

```markdown
# Deployment & Betrieb

## Erstmalige Einrichtung
[Voraussetzungen, Schnellstart: task cluster:create && task workspace:deploy,
 oder task workspace:up für alles auf einmal]

## Cluster-Lifecycle
[Tabelle: task cluster:create/delete/start/stop/status]

## Workspace-Deployment
[Tabelle: task workspace:up/deploy/status/validate/teardown/logs/restart/psql]

## Post-Deploy-Setup
[Reihenfolge: post-setup → vaultwarden:seed → monitoring → mcp:deploy → website:deploy]

## Website
[Tabelle: task website:build/deploy/dev/redeploy/status/logs/restart/teardown]

## MCP-Server
[Tabelle: task mcp:deploy/status/logs/restart/select/set-github-pat]

## Vaultwarden
[Tabelle: task workspace:vaultwarden:seed/seed-logs]

## Observability
[Tabelle: task observability:install/remove, task workspace:monitoring]

## TLS & DNS (Produktion)
[Tabelle: task cert:install/secret/status, task ddns:deploy/trigger/status/teardown]

## ArgoCD
[Tabelle: task argocd:setup/install/password/ui/login/status/sync/diff]

## Whisper (optional)
[Tabelle: task whisper:deploy/status/logs]

## Konfiguration
[Tabelle: task config:show, task domain:set, task brand:set, task email:set]

## Tägliche Befehle
[Die häufigsten Befehle: status, logs, restart, psql, port-forward]
```

- [ ] **Schritt 2: Commit**

```bash
git add k3d/docs-content/operations.md
git commit -m "docs: add operations and Taskfile reference"
```

---

## Task 17: `environments.md` — Dev/Prod/Staging-Umgebungen

**Files:**
- Create: `k3d/docs-content/environments.md`

**Quelldateien lesen:**
```bash
ls /home/patrick/Bachelorprojekt/environments/
cat /home/patrick/Bachelorprojekt/environments/schema.yaml
cat /home/patrick/Bachelorprojekt/environments/dev.yaml 2>/dev/null | head -40
cat /home/patrick/Bachelorprojekt/environments/mentolder.yaml 2>/dev/null | head -40
cat /home/patrick/Bachelorprojekt/environments/korczewski.yaml 2>/dev/null | head -40
ls /home/patrick/Bachelorprojekt/environments/sealed-secrets/ 2>/dev/null | head -10
cat /home/patrick/Bachelorprojekt/scripts/env-generate.sh | head -40
cat /home/patrick/Bachelorprojekt/scripts/env-seal.sh | head -40
```

- [ ] **Schritt 1: environments.md schreiben**

Struktur:

```markdown
# Umgebungen

## Überblick
[Drei Umgebungen: dev (k3d lokal), mentolder (Hetzner), korczewski (Hetzner/lokal)]

## Umgebungsvergleich
| Merkmal | dev (k3d) | mentolder | korczewski |
|---------|-----------|-----------|------------|
[Domain, TLS, ArgoCD, Sealed Secrets, DDNS, Resource Limits, etc.]

## Env-Registry (environments/)
[environments/schema.yaml: Konfigurations-Schema
 environments/dev.yaml, mentolder.yaml, korczewski.yaml: Werte pro Umgebung]

## Secrets-Management: Sealed Secrets
[Sealed Secrets Controller, bitnami/sealed-secrets.
 sealed-secrets-controller.yaml, environments/sealed-secrets/
 Workflow: task env:seal -- <key> <value> → SealedSecret YAML]

## Env-Skripte
[scripts/env-generate.sh, env-seal.sh, env-resolve.sh, env-validate.sh:
 Zweck und Nutzung jedes Skripts]

## Produktions-Deployment (ArgoCD)
[ArgoCD synchronisiert git → Cluster. Umgebung wird durch Cluster-Labels bestimmt]

## Neue Umgebung einrichten
[Schritt-für-Schritt: environments/<name>.yaml anlegen → sealed-secrets erzeugen →
 ArgoCD-Cluster registrieren → ApplicationSet sync]
```

- [ ] **Schritt 2: Commit**

```bash
git add k3d/docs-content/environments.md
git commit -m "docs: add environments documentation"
```

---

## Task 18: `argocd.md` — GitOps Multi-Cluster

**Files:**
- Create: `k3d/docs-content/argocd.md`

**Quelldateien lesen:**
```bash
cat /home/patrick/Bachelorprojekt/argocd/applicationset.yaml
cat /home/patrick/Bachelorprojekt/argocd/project.yaml
ls /home/patrick/Bachelorprojekt/argocd/install/
cat /home/patrick/Bachelorprojekt/argocd/install/*.yaml 2>/dev/null | head -60
grep -A 30 "argocd" /home/patrick/Bachelorprojekt/Taskfile.yml | head -60
```

- [ ] **Schritt 1: argocd.md schreiben**

Struktur:

```markdown
# ArgoCD — GitOps Multi-Cluster Federation

## Übersicht
[ArgoCD auf Hetzner Hub-Cluster. Synchronisiert git → alle registrierten Cluster.
 ApplicationSet generiert automatisch Apps pro Cluster]

## Architektur
[Mermaid-Diagramm: GitHub Repo → ArgoCD Hub → Cluster: hetzner, korczewski]

## AppProject
[argocd/project.yaml: Berechtigungen, erlaubte Repos, erlaubte Cluster]

## ApplicationSet
[argocd/applicationset.yaml: Wie Apps pro Cluster generiert werden.
 Cluster-Labels als Selektor]

## Ersteinrichtung
[Schritt-für-Schritt: task argocd:setup (einmalig)]
[Oder manuell: install → password → login → cluster:register → apps:apply]

## Cluster registrieren
[task argocd:cluster:register: Labels hetzner + korczewski setzen]

## Tägliche Nutzung
[task argocd:status, task argocd:sync -- <app>, task argocd:diff -- <app>]

## ArgoCD UI
[task argocd:ui → http://localhost:8090]

## CMP-Plugin (Kustomize + envsubst)
[argocd/install/: CMP-Sidecar für Kustomize mit envsubst-Unterstützung]

## Fehlerbehebung
[App OutOfSync, Sync schlägt fehl, Cluster nicht erreichbar]
```

- [ ] **Schritt 2: Commit**

```bash
git add k3d/docs-content/argocd.md
git commit -m "docs: add ArgoCD GitOps documentation"
```

---

## Task 19: `backup.md` — Backup & Wiederherstellung

**Files:**
- Create: `k3d/docs-content/backup.md`

**Quelldateien lesen:**
```bash
cat /home/patrick/Bachelorprojekt/k3d/backup-cronjob.yaml
cat /home/patrick/Bachelorprojekt/k3d/backup-pvc.yaml
cat /home/patrick/Bachelorprojekt/k3d/backup-secrets.yaml 2>/dev/null | head -20
```

- [ ] **Schritt 1: backup.md schreiben**

Struktur:

```markdown
# Backup & Wiederherstellung

## Übersicht
[CronJob für PostgreSQL-Datenbank-Backups. PVC als Backup-Speicher.
 Zeitplan, Aufbewahrungsdauer]

## Backup-Konfiguration
[backup-cronjob.yaml: Zeitplan (cron-Syntax), Befehl, Ziel-PVC]

## Speicher
[backup-pvc.yaml: StorageClass, Kapazität]

## Was wird gesichert
[PostgreSQL-Datenbanken: alle Datenbanken per pg_dumpall oder einzeln]

## Wiederherstellung
[Schritt-für-Schritt: Pod starten → pg_restore / psql < dump.sql]

## Manuelle Sicherung
[kubectl exec Befehl für manuelles pg_dump]

## Überwachung
[Wie man prüft ob Backup erfolgreich war: kubectl get jobs, logs]
```

- [ ] **Schritt 2: Commit**

```bash
git add k3d/docs-content/backup.md
git commit -m "docs: add backup documentation"
```

---

## Task 20: `security.md` — Sicherheitsarchitektur

**Files:**
- Modify: `k3d/docs-content/security.md`

**Quelldateien lesen:**
```bash
cat /home/patrick/Bachelorprojekt/k3d/network-policies.yaml
cat /home/patrick/Bachelorprojekt/k3d/traefik-middlewares-dev.yaml
cat /home/patrick/Bachelorprojekt/k3d/namespace.yaml
cat /home/patrick/Bachelorprojekt/k3d/docs-content/security.md
```

- [ ] **Schritt 1: security.md neu schreiben**

Struktur:

```markdown
# Sicherheitsarchitektur

## Übersicht
[Defense-in-Depth-Ansatz: Netzwerk → Authentifizierung → Container-Härtung → Daten]

## Authentifizierung & Autorisierung
[Alle Services hinter Keycloak OIDC. Traefik-Middlewares als erste Linie.
 oauth2-proxy für Services ohne native OIDC-Unterstützung]

## Netzwerksicherheit
[NetworkPolicies: Default-Deny Ingress + Egress.
 Erlaubte Verbindungen explizit aufgelistet.
 Mermaid-Diagramm: Wer darf mit wem kommunizieren]

## Traefik-Middlewares
[Middlewares aus traefik-middlewares-dev.yaml:
 - HTTPS-Redirect
 - Security-Header (X-Frame-Options, X-Content-Type-Options, etc.)
 - Basic Auth für interne Dienste (Mailpit, AI-Status)
 - Force-SSO für Dienste]

## Container-Härtung
[Pod Security Standards: restricted/namespace, allowPrivilegeEscalation: false,
 readOnlyRootFilesystem, runAsNonRoot, capabilities drop ALL, seccompProfile RuntimeDefault]

## TLS & Zertifikate
[Dev: kein TLS (k3d intern). Prod: cert-manager + lego DNS-01 + Let's Encrypt Wildcard.
 PostgreSQL: opportunistisches TLS mit selbst-signierten Zertifikaten]

## Secrets-Management
[Dev: k3d/secrets.yaml (keine echten Credentials).
 Prod: Sealed Secrets (asymmetrisch verschlüsselt, sicher im Git)]

## DSGVO-Compliance
[→ Siehe dsgvo.md für Details. Kurzfassung: On-Premises, keine Cloud-Registries,
 keine Telemetrie, NFA-01 Test-Suite]

## Sicherheitstest-Suite
[SA-01 bis SA-10: Transportverschlüsselung, Authentifizierung, Passwörter,
 Netzwerksegmentierung, MCP-Auth. → Siehe tests.md]
```

- [ ] **Schritt 2: Commit**

```bash
git add k3d/docs-content/security.md
git commit -m "docs: rewrite security architecture documentation"
```

---

## Task 21: `security-report.md` — Sicherheitsbericht

**Files:**
- Modify: `k3d/docs-content/security-report.md`

**Quelldateien lesen:**
```bash
cat /home/patrick/Bachelorprojekt/PENTEST_OVERVIEW.md
cat /home/patrick/Bachelorprojekt/k3d/pentest-flags.yaml
cat /home/patrick/Bachelorprojekt/k3d/docs-content/security-report.md
```

- [ ] **Schritt 1: security-report.md neu schreiben**

Struktur:

```markdown
# Sicherheitsbericht

## Pentest-Scope
[Aus PENTEST_OVERVIEW.md: Ziel, Systemübersicht, externe Endpunkte]

## Sicherheitsrelevante Konfigurationen
[SSO-Flows, OAuth2-Proxy, NetworkPolicies, Datenbank-Sicherheit — aus PENTEST_OVERVIEW.md]

## CTF-Objectives
[Tabelle: Kategorie | Zielobjekt | Flag | Nachweis von]

## Priorisierte Test-Szenarien
[SSO Bypass, IDP Exploitation, Lateral Movement, Header Injection, Sensitive Data]

## Testergebnisse
[Aktueller Stand der SA-01 bis SA-10 Tests. → task runner.sh local SA-01 ... SA-10]
```

- [ ] **Schritt 2: Commit**

```bash
git add k3d/docs-content/security-report.md
git commit -m "docs: rewrite security report"
```

---

## Task 22: `dsgvo.md` — DSGVO/GDPR Compliance

**Files:**
- Create: `k3d/docs-content/dsgvo.md`

**Quelldateien lesen:**
```bash
cat /home/patrick/Bachelorprojekt/scripts/dsgvo-compliance-check.sh
cat /home/patrick/Bachelorprojekt/k3d/docs-content/security.md | grep -A 30 "DSGVO\|GDPR"
cat /home/patrick/Bachelorprojekt/tests/local/NFA-01.sh
```

- [ ] **Schritt 1: dsgvo.md schreiben**

Struktur:

```markdown
# DSGVO / Datenschutz

## Datenschutz by Design
[On-Premises-Ansatz: alle Daten bleiben im Cluster. Keine Cloud-Abhängigkeiten.
 Keine Telemetrie, kein Tracking, keine externen CDNs in der Anwendung]

## Technische Maßnahmen (DSGVO Art. 25, 32)
[Liste: Verschlüsselung (TLS), Zugangskontrolle (Keycloak/OIDC), Pseudonymisierung,
 Backup, NetworkPolicies, keine privilegierten Container]

## Organisatorische Maßnahmen
[Zugriffskontrolle, Rollen, Audit-Logs in Keycloak]

## Datenverarbeitung
[→ Verarbeitungsverzeichnis (Art. 30 DSGVO): verarbeitungsverzeichnis.md]

## Automatisierter Compliance-Check (NFA-01)
[dsgvo-compliance-check.sh: Was wird geprüft (keine Cloud-Images, kein Tracking, etc.)
 task workspace:dsgvo-check]

## Monitoring-Dashboard
[Grafana DSGVO-Dashboard: Visualisierung der Compliance-Metriken]

## Datenlöschung
[Wie Benutzerdaten gelöscht werden: Keycloak User löschen, Nextcloud Dateien,
 PostgreSQL Records]
```

- [ ] **Schritt 2: Commit**

```bash
git add k3d/docs-content/dsgvo.md
git commit -m "docs: add DSGVO compliance documentation"
```

---

## Task 23: `verarbeitungsverzeichnis.md` — VVT Art. 30 DSGVO

**Files:**
- Modify: `k3d/docs-content/verarbeitungsverzeichnis.md`

**Quelldateien lesen:**
```bash
cat /home/patrick/Bachelorprojekt/k3d/docs-content/verarbeitungsverzeichnis.md
```

- [ ] **Schritt 1: Bestehende Datei prüfen und aktualisieren**

Die bestehende Datei inhaltlich prüfen. Sicherstellen dass:
- Invoice Ninja / billing-bot Einträge entfernt sind
- Alle aktuellen Services erfasst sind: Keycloak, Nextcloud, Vaultwarden, Website, Claude Code, Whiteboard
- Struktur gem. Art. 30 DSGVO: Verantwortlicher, Zweck, Kategorien, Empfänger, Löschfristen, TOMs

Datei aktualisieren mit aktuellen Services. Entfernen: Invoice Ninja, Stripe, billing-bot.

- [ ] **Schritt 2: Commit**

```bash
git add k3d/docs-content/verarbeitungsverzeichnis.md
git commit -m "docs: update Verarbeitungsverzeichnis — remove Invoice Ninja"
```

---

## Task 24: `tests.md` — Testframework

**Files:**
- Modify: `k3d/docs-content/tests.md`

**Quelldateien lesen:**
```bash
cat /home/patrick/Bachelorprojekt/tests/runner.sh | head -60
ls /home/patrick/Bachelorprojekt/tests/local/
ls /home/patrick/Bachelorprojekt/tests/e2e/specs/ 2>/dev/null | head -20
for f in /home/patrick/Bachelorprojekt/tests/local/FA-*.sh; do head -2 "$f"; done
for f in /home/patrick/Bachelorprojekt/tests/local/SA-*.sh; do head -2 "$f"; done
for f in /home/patrick/Bachelorprojekt/tests/local/NFA-*.sh; do head -2 "$f"; done
```

- [ ] **Schritt 1: tests.md neu schreiben**

Struktur:

```markdown
# Testframework & Test-IDs

## Überblick
[runner.sh als Orchestrierung. Zwei Tiers: local (k3d) und prod (k3s).
 Typen: Bash-Scripttests (local/), Playwright E2E (e2e/), BATS Unit-Tests (unit/)]

## Tests ausführen
[Befehle: runner.sh local, runner.sh local <ID>, runner.sh prod, runner.sh report]

## Funktionale Tests (FA)
[Tabelle: ID | Beschreibung | Status]
FA-01 bis FA-26 — je aus dem Kommentar in den Testdateien ableiten

## Sicherheitstests (SA)
[Tabelle: ID | Beschreibung]
SA-01 bis SA-10

## Nicht-funktionale Tests (NFA)
[Tabelle: ID | Beschreibung]
NFA-01 bis NFA-09

## Abnahmetests (AK)
[AK-03, AK-04]

## Playwright E2E-Tests
[tests/e2e/: Welche Specs existieren, playwright.config.ts, Ausführung]

## Testergebnisse
[test-results/: Format der Reports, runner.sh report]

## Neuen Test hinzufügen
[Datei anlegen, Namenskonvention, assert.sh-Funktionen nutzen]
```

- [ ] **Schritt 2: Commit**

```bash
git add k3d/docs-content/tests.md
git commit -m "docs: rewrite tests documentation"
```

---

## Task 25: `benutzerhandbuch.md` — Endnutzer-Anleitung

**Files:**
- Modify: `k3d/docs-content/benutzerhandbuch.md`

**Quelldateien lesen:**
```bash
cat /home/patrick/Bachelorprojekt/k3d/docs-content/benutzerhandbuch.md
cat /home/patrick/Bachelorprojekt/k3d/configmap-domains.yaml
```

- [ ] **Schritt 1: benutzerhandbuch.md komplett neu schreiben**

Kein HTML. Reines Markdown. Für Endnutzer ohne technisches Vorwissen.

Struktur:

```markdown
# Benutzerhandbuch — Workspace

## Willkommen
[Was ist der Workspace, welche Services stehen zur Verfügung]

## Erster Login (SSO)
[Schritt-für-Schritt: URL aufrufen → "Login mit Workspace-Konto" → Keycloak-Login-Formular → Zugang]

## Nextcloud — Dateien, Kalender & Kontakte
[Dateien hochladen/teilen, Kalender anlegen, Kontakte verwalten. Screenshots-Beschreibungen]

## Talk — Video-Calls
[Meeting starten, Teilnehmer einladen, Screen-Sharing, Aufzeichnung]

## Vaultwarden — Passwörter
[Bitwarden-Client installieren, Server-URL eingeben: https://vault.korczewski.de,
 Passwörter speichern, Passwörter teilen]

## Whiteboard
[Über Nextcloud öffnen, Zeichnen, Teilen]

## Passwort ändern
[Über Keycloak Account-Console: auth.korczewski.de/realms/workspace/account]

## Hilfe & Kontakt
[Wo Hilfe bekommen, Bug melden]
```

- [ ] **Schritt 2: Commit**

```bash
git add k3d/docs-content/benutzerhandbuch.md
git commit -m "docs: rewrite Benutzerhandbuch"
```

---

## Task 26: `adminhandbuch.md` — Admin-Anleitung

**Files:**
- Modify: `k3d/docs-content/adminhandbuch.md`

**Quelldateien lesen:**
```bash
cat /home/patrick/Bachelorprojekt/k3d/docs-content/adminhandbuch.md
cat /home/patrick/Bachelorprojekt/scripts/admin-users-setup.sh
cat /home/patrick/Bachelorprojekt/scripts/import-users.sh | head -40
cat /home/patrick/Bachelorprojekt/k3d/docs-content/admin-projekte.md
```

- [ ] **Schritt 1: adminhandbuch.md komplett neu schreiben**

Struktur:

```markdown
# Adminhandbuch — Workspace

## Voraussetzungen
[Docker, k3d, kubectl, task. Zugangsdaten zum Cluster]

## Cluster einrichten
[task cluster:create, task workspace:deploy, Reihenfolge der Post-Setup-Schritte]

## Benutzerverwaltung
### Keycloak Admin-UI
[URL: auth.localhost/auth, admin/devadmin. Benutzer anlegen, Rollen zuweisen]

### Massenimport
[scripts/import-users.sh, users-example.csv Format, Aufruf]

### Admin-User einrichten
[scripts/admin-users-setup.sh]

## Nextcloud-Administration
[occ-Befehle via kubectl exec, Apps aktivieren/deaktivieren, Storage-Limits]

## Keycloak-Administration
[Realm-Export/Import, OIDC-Client hinzufügen, Passwort-Policy ändern]

## Monitoring
[Grafana-Zugang, Dashboards, Alerts einrichten]

## Backup-Verwaltung
[Backup-Status prüfen, manuelle Sicherung, Wiederherstellung]

## Produktions-Deployment
[task workspace:prod:deploy, ArgoCD-Sync, Umgebungswechsel]

## Routineaufgaben
[Tägliche/wöchentliche Checks: task workspace:status, Logs prüfen, Speicher]
```

- [ ] **Schritt 2: Commit**

```bash
git add k3d/docs-content/adminhandbuch.md
git commit -m "docs: rewrite Adminhandbuch"
```

---

## Task 27: `admin-projekte.md` — Projekt-Verwaltung

**Files:**
- Modify: `k3d/docs-content/admin-projekte.md`

**Quelldateien lesen:**
```bash
cat /home/patrick/Bachelorprojekt/k3d/docs-content/admin-projekte.md
cat /home/patrick/Bachelorprojekt/k3d/meetings-schema.yaml 2>/dev/null | head -40
```

- [ ] **Schritt 1: admin-projekte.md aktualisieren**

Inhalt prüfen und aktualisieren: Invoice Ninja / billing entfernen falls vorhanden. Meetings-Schema ergänzen falls relevant. Datei auf aktuellen Stand bringen.

- [ ] **Schritt 2: Commit**

```bash
git add k3d/docs-content/admin-projekte.md
git commit -m "docs: update admin-projekte"
```

---

## Task 28: `contributing.md` — Beitragen & CI/CD

**Files:**
- Create: `k3d/docs-content/contributing.md`

**Quelldateien lesen:**
```bash
cat /home/patrick/Bachelorprojekt/CONTRIBUTING.md
cat /home/patrick/Bachelorprojekt/.github/pull_request_template.md
cat /home/patrick/Bachelorprojekt/.github/workflows/ci.yml 2>/dev/null | head -80
```

- [ ] **Schritt 1: contributing.md schreiben**

Struktur (CONTRIBUTING.md als Basis, für Docs-Format adaptieren):

```markdown
# Beitragen zum Workspace MVP

## Workflow
[Branch erstellen → entwickeln → validieren → PR → CI → Merge]
[Mermaid-Flowchart aus CONTRIBUTING.md übernehmen]

## Branch-Namenskonvention
[feature/*, fix/*, chore/*]

## Lokale Entwicklung
[k3d-Cluster, task workspace:deploy, tägliche Befehle]

## Vor dem Commit
[task workspace:validate, shellcheck scripts/*.sh]

## CI-Pipeline
[Mermaid-Flowchart der Pipeline: YAML-Lint, Kustomize/kubeconform, ShellCheck, Config-Validierung, Security-Scan]
[Was jeder Check prüft]

## Monorepo-Regeln
[k3d/ ist der einzige Deployment-Pfad. Domains zentral. Secrets nur Dev-Werte. etc.]

## PR erstellen
[gh pr create, PR-Template, Checkliste]

## Merge
[Squash-and-Merge für saubere History]
```

- [ ] **Schritt 2: Commit**

```bash
git add k3d/docs-content/contributing.md
git commit -m "docs: add contributing and CI/CD documentation"
```

---

## Task 29: `scripts.md` — Skripte-Referenz

**Files:**
- Modify: `k3d/docs-content/scripts.md`

**Quelldateien lesen:**
```bash
ls /home/patrick/Bachelorprojekt/scripts/
for f in /home/patrick/Bachelorprojekt/scripts/*.sh; do echo "=== $(basename $f) ==="; head -5 "$f"; done
```

- [ ] **Schritt 1: scripts.md neu schreiben**

Struktur:

```markdown
# Skripte-Referenz

## Übersicht
[scripts/ enthält Bash-Hilfsskripte für: Migration, User-Import, DSGVO, MCP, Env-Mgmt]

## Skripte

### admin-users-setup.sh
[Zweck, Parameter, Beispiel]

### check-connectivity.sh
[Zweck, Verwendung]

### check-updates.sh
[Zweck, Verwendung]

### dsgvo-compliance-check.sh
[Zweck: NFA-01-Check, was geprüft wird, Aufruf via task workspace:dsgvo-check]

### env-generate.sh / env-seal.sh / env-resolve.sh / env-validate.sh
[Env-Registry-Workflow: Generieren, Verschlüsseln, Auflösen, Validieren]

### import-users.sh
[CSV-Format, Massenimport in Keycloak, Beispiel]

### keycloak-sync-secrets.sh
[Zweck, Verwendung]

### mcp-select.sh
[Interaktiver MCP-Server-Selektor, Aufruf via task mcp:select]

### migrate.sh
[Datenmigration zwischen Umgebungen]

### recording-setup.sh / talk-hpb-setup.sh / transcriber-setup.sh
[Talk-Stack Setup-Skripte]

### seed-test-meetings.sh
[Test-Meeting-Daten einspielen]

### setup.sh
[Ersteinrichtung]

### setup-wireguard.sh
[WireGuard VPN-Konfiguration]
```

- [ ] **Schritt 2: Commit**

```bash
git add k3d/docs-content/scripts.md
git commit -m "docs: rewrite scripts reference"
```

---

## Task 30: `migration.md` — Daten-Migration

**Files:**
- Modify: `k3d/docs-content/migration.md`

**Quelldateien lesen:**
```bash
cat /home/patrick/Bachelorprojekt/k3d/docs-content/migration.md
cat /home/patrick/Bachelorprojekt/scripts/migrate.sh | head -60
cat /home/patrick/Bachelorprojekt/scripts/import-users.sh | head -40
```

- [ ] **Schritt 1: migration.md aktualisieren**

Inhalt prüfen. Invoice Ninja / Mattermost-Referenzen entfernen (Mattermost wurde entfernt lt. FA-01.sh). Aktuellen Stand dokumentieren.

Struktur sicherstellen:

```markdown
# Migration

## Übersicht
[Was migriert werden kann: Benutzer, Dateien. Von welchen Quellen]

## Benutzer-Import
[scripts/import-users.sh, users-example.csv Format, Schritte]

## Dateien-Migration
[Nextcloud als Ziel, Methoden]

## Zwischen Umgebungen migrieren
[scripts/migrate.sh: Zweck und Verwendung]
```

- [ ] **Schritt 2: Commit**

```bash
git add k3d/docs-content/migration.md
git commit -m "docs: update migration documentation"
```

---

## Task 31: `requirements.md` + `troubleshooting.md`

**Files:**
- Modify: `k3d/docs-content/requirements.md`
- Modify: `k3d/docs-content/troubleshooting.md`

**Quelldateien lesen:**
```bash
cat /home/patrick/Bachelorprojekt/k3d/docs-content/requirements.md
cat /home/patrick/Bachelorprojekt/k3d/docs-content/troubleshooting.md
for f in /home/patrick/Bachelorprojekt/tests/local/FA-*.sh; do echo "$(basename $f): $(head -2 $f | tail -1)"; done
```

- [ ] **Schritt 1: requirements.md aktualisieren**

Invoice Ninja / Mattermost aus Anforderungsliste entfernen. Aktuelle FA-01 bis FA-26 vollständig auflisten.

Struktur:

```markdown
# Anforderungen

## Kategorien
[Tabelle: FA / SA / NFA / AK mit Anzahl und Beschreibung]

## Funktionale Anforderungen (FA-01 bis FA-26)
[Tabelle: ID | Bezeichnung | Beschreibung | Test-Status]

## Sicherheitsanforderungen (SA-01 bis SA-10)
[Tabelle: ID | Bezeichnung | Beschreibung]

## Nicht-funktionale Anforderungen (NFA-01 bis NFA-09)
[Tabelle: ID | Bezeichnung | Beschreibung]

## Abnahmekriterien (AK-03, AK-04)
[Tabelle: ID | Bezeichnung | Beschreibung]
```

- [ ] **Schritt 2: troubleshooting.md aktualisieren**

Invoice Ninja / Mattermost / billing entfernen. Aktuelle Services ergänzen.

Struktur sicherstellen:

```markdown
# Fehlerbehebung

## Diagnose-Befehle
[task workspace:status, kubectl get pods, kubectl describe pod, kubectl logs]

## Cluster startet nicht
[k3d-Probleme, Docker-Ressourcen]

## Service nicht erreichbar
[Ingress prüfen, Pod-Status, Logs]

## Keycloak / SSO-Probleme
[Realm nicht importiert, OIDC-Fehler, Passwort vergessen]

## Nextcloud-Probleme
[occ-Befehle, Dateisystem-Berechtigungen, Talk funktioniert nicht]

## Vaultwarden-Probleme
[OIDC-Login, Client verbindet nicht]

## PostgreSQL-Probleme
[Verbindung fehlgeschlagen, Datenbank nicht vorhanden, Speicher voll]

## CI/CD-Probleme
[kustomize build schlägt fehl, kubeconform-Fehler, YAML-Lint]
```

- [ ] **Schritt 3: Commit**

```bash
git add k3d/docs-content/requirements.md k3d/docs-content/troubleshooting.md
git commit -m "docs: update requirements and troubleshooting"
```

---

## Task 32: Abschluss — Validierung & Final Commit

**Files:**
- Verify: `k3d/kustomization.yaml`
- Verify: `k3d/docs-content/_sidebar.md`

- [ ] **Schritt 1: Alle neuen Dateien im Verzeichnis prüfen**

```bash
ls /home/patrick/Bachelorprojekt/k3d/docs-content/*.md | sort
```

Erwartetes Ergebnis: Alle 33 Markdown-Dateien vorhanden.

- [ ] **Schritt 2: kustomization.yaml prüfen — alle Dateien gelistet**

```bash
grep "docs-content/" /home/patrick/Bachelorprojekt/k3d/kustomization.yaml | wc -l
```

Erwartetes Ergebnis: ≥ 30 Einträge.

- [ ] **Schritt 3: Sidebar-Links prüfen — kein toter Link**

```bash
# Prüft ob jede in der Sidebar verlinkte Datei auch existiert
grep -oP '\(\K[^)]+(?=\))' /home/patrick/Bachelorprojekt/k3d/docs-content/_sidebar.md | \
while read link; do
  if [[ ! -f "/home/patrick/Bachelorprojekt/k3d/docs-content/${link}.md" ]]; then
    echo "FEHLT: ${link}.md"
  fi
done
```

Erwartetes Ergebnis: Keine Ausgabe (alle Links gültig).

- [ ] **Schritt 4: Manifest-Validierung**

```bash
cd /home/patrick/Bachelorprojekt && task workspace:validate 2>&1 | tail -10
```

Erwartetes Ergebnis: Keine Fehler.

- [ ] **Schritt 5: Final Commit**

```bash
git add k3d/docs-content/ k3d/kustomization.yaml
git status
git commit -m "docs: complete German documentation rewrite" || echo "nothing to commit"
```
