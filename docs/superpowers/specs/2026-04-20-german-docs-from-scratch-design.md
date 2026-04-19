# Spec: Deutsche Dokumentation von Grund auf neu

**Datum:** 2026-04-20  
**Status:** Genehmigt  

## Ziel

Vollständige, deutschsprachige Dokumentation für das Workspace MVP (Kubernetes-basierte Kollaborationsplattform, Bachelorarbeit) neu schreiben. Die bestehenden Dateien in `k3d/docs-content/` werden komplett überschrieben; neue Dateien werden hinzugefügt. Die Kustomize-Konfiguration (`k3d/kustomization.yaml`) wird um alle neuen Dateien erweitert.

## Zielgruppen

- **Autor selbst** — technische Tiefe, vollständige Referenz
- **Betreuer/Prüfer** — nachvollziehbare Architektur, Begründungen, akademischer Anspruch
- **Admins** — Setup, Betrieb, User-Management, Keycloak
- **Endnutzer** — Login, Nextcloud, Vaultwarden, Video-Calls

## Deployment-Kontext

- Dateien liegen flach in `k3d/docs-content/` (ConfigMap-Constraint via Kustomize)
- Docsify rendert sie als statische Site unter `docs.localhost` / `docs.korczewski.de`
- `_sidebar.md` steuert die Navigation
- `kustomization.yaml` muss jede neue Datei als ConfigMap-Eintrag listen
- Scope: umgebungsübergreifend (dev/k3d + prod/mentolder + prod/korczewski)

## Dateistruktur (35 Dateien)

### Navigation
- `_sidebar.md` — Docsify-Sidebar mit allen Sections

### Einführung
- `README.md` — Startseite: Projektübersicht, Schnellstart, Service-Endpunkte, Architektur-Diagramm
- `architecture.md` — Systemarchitektur: Komponenten-Diagramm, SSO-Flow (Sequenz), Deployment-Flow, Netzwerk

### Services (je eine Datei, umgebungsübergreifend)
- `keycloak.md` — SSO/OIDC, Realm-Config, OIDC-Clients, SSO-Flow, Admin-UI
- `nextcloud.md` — Dateiverwaltung, Kalender, Kontakte, Talk Video, OIDC-Integration
- `collabora.md` — Office-Suite, WOPI-Integration mit Nextcloud, keine eigene UI
- `talk-hpb.md` — Signaling-Stack: Janus Gateway, NATS, coturn TURN/STUN
- `claude-code.md` — Claude Code KI, alle 13 MCP-Server, RBAC, MCP-Aktionskatalog
- `vaultwarden.md` — Passwort-Manager, Bitwarden-kompatibel, Seed-Jobs, OIDC
- `website.md` — Astro + Svelte Website (mentolder.de + korczewski.de), Chat, Deploy
- `whiteboard.md` — Nextcloud Whiteboard Backend, WebSocket
- `mailpit.md` — Dev-Mailserver, Verwendung in Tests
- `whisper.md` — faster-whisper Transkription, Talk Recording
- `monitoring.md` — Prometheus + Grafana, DSGVO-Dashboard, Alerting
- `shared-db.md` — PostgreSQL 16, Datenbanken pro Service, Backup, Verbindungen

### Betrieb
- `operations.md` — Vollständige Taskfile-Referenz, tägliche Befehle, Post-Setup-Schritte
- `environments.md` — Drei Umgebungen (dev/mentolder/korczewski), Sealed Secrets, Env-Registry
- `argocd.md` — ArgoCD Multi-Cluster GitOps, ApplicationSet, Cluster-Registrierung
- `backup.md` — Backup-CronJob, PVC, Wiederherstellungsverfahren

### Sicherheit
- `security.md` — Sicherheitsarchitektur: NetworkPolicies, Traefik Middlewares, TLS, Authflow
- `security-report.md` — Sicherheitsbericht: Pentest-Scope, CTF-Objectives, Ergebnisse
- `dsgvo.md` — DSGVO/GDPR Compliance, Datenschutz by Design, NFA-01
- `verarbeitungsverzeichnis.md` — VVT gem. Art. 30 DSGVO

### Tests
- `tests.md` — Testframework (runner.sh), alle Test-IDs (FA/SA/NFA/AK), Playwright E2E, BATS

### Benutzerhandbuch
- `benutzerhandbuch.md` — Endnutzer: Login via SSO, Nextcloud, Vaultwarden, Video-Calls, Chat

### Administration
- `adminhandbuch.md` — Admins: Cluster-Setup, Service-Deploy, User-Management, Keycloak-Admin
- `admin-projekte.md` — Projekt-Verwaltung im Admin-Bereich

### Entwicklung
- `contributing.md` — Branch-Workflow, CI/CD-Pipeline, PR-Prozess, Monorepo-Regeln
- `scripts.md` — Alle Bash-Skripte mit Parametern und Beispielen
- `migration.md` — Import von Slack/Teams/Google Workspace
- `requirements.md` — Anforderungsdefinitionen FA/SA/NFA mit Test-IDs
- `troubleshooting.md` — Häufige Probleme, Diagnose-Befehle, Lösungsansätze

## Schreibprinzipien

- Sprache: Deutsch durchgehend (Fachbegriffe auf Englisch bleiben, z.B. "Deployment", "ConfigMap")
- Ton: Sachlich, präzise, keine Marketing-Sprache
- Code-Blöcke für alle Befehle, Mermaid-Diagramme wo sinnvoll
- Jede Service-Datei folgt Template: Zweck → Konfiguration → Betrieb → Fehlerbehebung
- Umgebungsunterschiede werden explizit mit Hinweisblöcken markiert (`> **Produktion:**`)
- Keine ausgedachten Features — nur was im Repository existiert

## Nicht im Scope

- Invoice Ninja, billing-bot, Stripe (aus dem Stack entfernt)
- Docker Compose (kein Deployment-Pfad)
- Externe SaaS-Dienste

## Kustomize-Update

`k3d/kustomization.yaml` erhält Einträge für alle ~15 neuen Dateien im `docs-content` ConfigMap-Generator.
