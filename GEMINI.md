# Workspace MVP - Gemini Kontext

Dieses Dokument stellt den wesentlichen Kontext und Anleitungen fuer KI-Assistenten bereit, die am **Workspace MVP** (Bachelorprojekt) arbeiten. Das Projekt ist eine Kubernetes-basierte Kollaborationsplattform fuer kleine Teams, die mehrere Open-Source-Services mit Single Sign-On (SSO) und einem selbst gehosteten KI-Assistenten integriert.

## Projektuebersicht

- **Kerntechnologien:** Kubernetes (k3d/k3s), Kustomize, Go (billing-bot), Shell-Skripte, Taskfile.
- **Architektur:** Microservices-orientierte Architektur, die hauptsaechlich im `workspace`-Namespace laeuft.
- **Wichtige Services:**
  - **Keycloak (SSO):** Identity Management und OIDC-Provider (`auth.localhost`).
  - **Mattermost:** Team-Chat und Kollaboration (`chat.localhost`).
  - **Nextcloud:** Dateispeicher, Talk (Video) und Collabora Office (`files.localhost`).
  - **Claude Code (KI-Assistent):** Lokaler KI-Client mit MCP-basiertem Tool-Zugriff (`ai.localhost`).
  - **Website:** Unternehmens-Webseite (`web.localhost`).
  - **Billing Bot:** Go-Service, der Mattermost-Slash-Commands mit Invoice Ninja verbindet.
  - **Invoice Ninja:** Buchhaltungs- und Rechnungsplattform (`billing.localhost`).
- **Infrastruktur:**
  - **Ingress:** Traefik (k3s built-in). Keine separate NGINX-Ingress-Installation erforderlich.
  - **KI-Backend:** Anthropic API (Claude Sonnet 4).
  - **Kommunikation:** coturn (STUN/TURN), spreed-signaling (Talk HPB), Janus Gateway.
  - **Hilfsdienste:** Mailpit (SMTP-Entwicklung), OpenSearch (Suche), Vaultwarden (Passwoerter), Whiteboard, Backup-CronJobs.

## Bauen und Ausfuehren

Das Projekt verwendet `task` (go-task) zur Orchestrierung.

### Wichtige Befehle

- **Cluster-Verwaltung:**
  - `task cluster:create`: Lokalen k3d-Cluster erstellen (nutzt k3d-config.yaml).
  - `task cluster:delete`: k3d-Cluster entfernen.
- **Deployment:**
  - `task workspace:deploy`: Alle Services im Cluster deployen (Kustomize).
  - `task workspace:validate`: Dry-Run und Kubernetes-Manifeste validieren.
- **Observability:**
  - `task workspace:monitoring`: Prometheus + Grafana Stack installieren (erforderlich fuer NFA-02).
  - `task workspace:status`: Status aller Pods und Services pruefen.
  - `task workspace:logs -- <service>`: Logs eines bestimmten Service ansehen (z.B. `keycloak`).
  - `task workspace:restart -- <service>`: Einen bestimmten Service neu starten.

### Tests

Automatisierte Testsuite (Bash + Playwright) gegen den lokalen Cluster ausfuehren:
```bash
./tests/runner.sh local              # Alle Tests ausfuehren
./tests/runner.sh local <TEST-ID>    # Bestimmten Test ausfuehren (z.B. SA-08)
```

## Entwicklungskonventionen

### Branching und PRs
- **Branch-Strategie:** Immer auf einem Feature-Branch arbeiten (`feature/*`, `fix/*`, `chore/*`). **Niemals direkt auf `main` committen.**
- **Pull Requests:** Alle Aenderungen muessen durch einen PR gehen. PR-Template verwenden und sicherstellen, dass CI (YAML-Lint, Shellcheck, Manifest-Validierung) besteht.
- **Merging:** **Squash-and-Merge** verwenden fuer eine saubere `main`-History.

### Kubernetes & Konfiguration
- **Manifeste:** Basis-Manifeste liegen in `k3d/`. Produktions-spezifische Overlays/Patches in `prod/`.
- **Kustomize:** Immer Kustomize fuer die Verwaltung von Kubernetes-Ressourcen verwenden.
- **Zentrale Domains:** Hostnamen sind zentral in `k3d/configmap-domains.yaml` definiert. Keine hartkodierten Hostnamen in anderen Manifesten.
- **Secrets:** `k3d/secrets.yaml` fuer Entwicklungs-Secrets verwenden. Niemals echte Produktions-Zugangsdaten committen.

## Richtlinien fuer KI-Assistenten

Bei der Ausfuehrung einer Aufgabe:
1. **Recherche:** Die Service-Interaktion verstehen.
2. **Strategie:** Aenderungen an K8s-Manifesten, Skripten oder dem billing-bot-Code planen.
3. **Branching:** Einen dedizierten Branch mit `git checkout -b` erstellen.
4. **Kollaboration:** Falls verfuegbar, mit **Claude Code** in den Admin-Kanaelen in Mattermost zusammenarbeiten.
5. **Umsetzung:**
   - Gezielte Aenderungen vornehmen.
   - Bei Aenderung von Kubernetes-Manifesten `task workspace:validate` ausfuehren.
6. **Validierung:** Relevante Tests mit `./tests/runner.sh local` ausfuehren.
7. **PR:** `gh pr create` mit dem Repository-Template verwenden.
