# Workspace MVP

Kubernetes-basierte Kollaborationsplattform für kleine Teams — Mattermost (Chat), Nextcloud (Dateien + Talk Video + Collabora Office), Keycloak (SSO) auf k3d/k3s mit Traefik Ingress.

## Schnellstart

Voraussetzungen: Docker, [k3d](https://k3d.io), kubectl, [task](https://taskfile.dev)

```bash
git clone https://github.com/Paddione/Bachelorprojekt.git && cd Bachelorprojekt

# Cluster erstellen + alle Services deployen
cd .. && task cluster:create && task ingress:install && task workspace:deploy
```

Services sind erreichbar unter:
- **Keycloak (SSO):** http://auth.localhost (admin / devadmin)
- **Mattermost (Chat):** http://chat.localhost
- **Nextcloud (Dateien + Talk):** http://files.localhost
- **Collabora (Office):** http://office.localhost
- **Talk HPB (Signaling):** http://signaling.localhost

## Dokumentation

| Dokument | Beschreibung |
|----------|-------------|
| [Architektur](docs/architecture.md) | Systemübersicht, Service-Diagramm, Netzwerk und Datenfluss |
| [Services](docs/services.md) | Kubernetes-Services und deren Zusammenspiel |
| [Keycloak & SSO](docs/keycloak.md) | Identity Management, OIDC-Clients |
| [Migration](docs/migration.md) | Import von Slack, Teams, Google Workspace |
| [Skripte](docs/scripts.md) | Referenz aller Skripte, Parameter und Befehle |
| [Tests](docs/tests.md) | Automatisiertes Test-Framework |
| [Sicherheit](docs/security.md) | Sicherheitsrichtlinien und Best Practices |
| [Fehlerbehebung](docs/troubleshooting.md) | Häufige Probleme und Lösungsansätze |

## Architektur

```
              NGINX Ingress (Ports 80/443)
                     |
    +----------------+----------------+--------------+
    v                v                v              v
+--------+    +----------+    +----------+    +-----------+    +----------+
|Matter- |    |Nextcloud |    |Keycloak  |    | Collabora |    | Talk HPB |
|most    |    | + Talk   |    |  (SSO)   |    |  Online   |    | Signaling|
+--------+    +----------+    +----------+    +-----------+    +----------+
    |              |               |                            | Janus    |
+--------+    +----------+    +----------+                     | NATS     |
|  DB    |    |    DB    |    |    DB    |                     | coturn   |
|(PG 16) |    | (PG 16) |    | (PG 16) |                     +----------+
+--------+    +----------+    +----------+

Namespace: workspace
Alle Services laufen als Kubernetes Deployments in k3d/k3s.
```

## Tägliche Befehle

```bash
task workspace:status           # Pod-Status prüfen
task workspace:logs -- keycloak # Logs eines Service ansehen
task workspace:restart -- mattermost  # Service neustarten
task workspace:validate         # Manifeste validieren
task workspace:teardown         # Alles entfernen
```

## Tests

```bash
./tests/runner.sh local              # Alle Tests gegen k3d
./tests/runner.sh local SA-08        # Einzelnen Test ausführen
./tests/runner.sh report             # Markdown-Report generieren
```

## Projektstruktur

```
Bachelorprojekt/
  k3d/                          # Kubernetes-Manifeste (Kustomize)
    kustomization.yaml          # Kustomize-Orchestrierung
    configmap-domains.yaml      # Domain-Konfiguration
    secrets.yaml                # Dev-Secrets
    ingress.yaml                # NGINX Ingress Rules
    keycloak*.yaml              # Keycloak + DB
    mattermost*.yaml            # Mattermost + DB
    nextcloud*.yaml             # Nextcloud + DB
    talk-hpb.yaml               # Nextcloud Talk HPB (Signaling + Janus + NATS)
    coturn.yaml                 # TURN/STUN Server
    collabora.yaml              # Collabora Online (Dokumentenbearbeitung)
    realm-workspace-dev.json   # Keycloak Realm-Konfiguration
    nextcloud-oidc-dev.php      # Nextcloud OIDC-Konfiguration
  scripts/                      # Migration, Import, Utility-Skripte
  tests/                        # Automatisierte Tests (Bash + Playwright)
  docs/                         # Dokumentation
  mattermost/                   # Mattermost Keycloak-Proxy Config
```

## Regeln für dieses Monorepo

1. **Einziger Deployment-Pfad ist k3d/k3s.** Es gibt keine docker-compose-Konfiguration.
2. **Alle Kubernetes-Manifeste liegen in `k3d/`.** Kustomize ist das Build-Tool.
3. **Änderungen gehen immer durch Pull Requests** — keine direkten Pushes auf `main`.
4. **CI muss grün sein** vor dem Merge (Manifest-Validierung, YAML-Lint, Shellcheck, Security-Scan).
5. **Domain-Konfiguration ist zentral** in `k3d/configmap-domains.yaml`. Keine hartkodierten Hostnamen in Manifesten.
6. **Secrets liegen in `k3d/secrets.yaml`** (nur Dev-Werte). Niemals echte Credentials committen.
7. **Tests laufen gegen den lokalen k3d-Cluster** via `./tests/runner.sh local`.
