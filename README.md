# Homeoffice MVP

Kubernetes-basierte Kollaborationsplattform für kleine Teams — Mattermost (Chat), Nextcloud (Dateien), Keycloak (SSO) und Jitsi (Video) auf k3d/k3s mit NGINX Ingress.

## Schnellstart

Voraussetzungen: Docker, [k3d](https://k3d.io), kubectl, [task](https://taskfile.dev)

```bash
git clone https://github.com/Paddione/Bachelorprojekt.git && cd Bachelorprojekt

# Cluster erstellen + alle Services deployen
cd .. && task cluster:create && task ingress:install && task homeoffice:deploy
```

Services sind erreichbar unter:
- **Keycloak (SSO):** http://auth.localhost (admin / devadmin)
- **Mattermost (Chat):** http://chat.localhost
- **Nextcloud (Dateien):** http://files.localhost
- **Jitsi (Video):** http://meet.localhost

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
+--------+    +----------+    +----------+    +----------+
|Matter- |    |Nextcloud |    |Keycloak  |    |  Jitsi   |
|most    |    |          |    |  (SSO)   |    |  Meet    |
+--------+    +----------+    +----------+    +----------+
    |              |               |               |
+--------+    +----------+    +----------+    +----------+
|  DB    |    |    DB    |    |    DB    |    | Prosody  |
|(PG 16) |    | (PG 16) |    | (PG 16) |    | Jicofo   |
+--------+    +----------+    +----------+    |   JVB    |
                                              +----------+

Namespace: homeoffice
Alle Services laufen als Kubernetes Deployments in k3d/k3s.
```

## Tägliche Befehle

```bash
task homeoffice:status           # Pod-Status prüfen
task homeoffice:logs -- keycloak # Logs eines Service ansehen
task homeoffice:restart -- mattermost  # Service neustarten
task homeoffice:validate         # Manifeste validieren
task homeoffice:teardown         # Alles entfernen
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
    jitsi-*.yaml                # Jitsi (Web, Prosody, Jicofo, JVB, Adapter)
    realm-homeoffice-dev.json   # Keycloak Realm-Konfiguration
    nextcloud-oidc-dev.php      # Nextcloud OIDC-Konfiguration
  scripts/                      # Migration, Import, Utility-Skripte
  tests/                        # Automatisierte Tests (Bash + Playwright)
  docs/                         # Dokumentation
  mattermost/                   # Mattermost Keycloak-Proxy Config
  jitsi-keycloak-adapter/       # Gepatchter OIDC→JWT Adapter
```

## Regeln für dieses Monorepo

1. **Einziger Deployment-Pfad ist k3d/k3s.** Es gibt keine docker-compose-Konfiguration.
2. **Alle Kubernetes-Manifeste liegen in `k3d/`.** Kustomize ist das Build-Tool.
3. **Änderungen gehen immer durch Pull Requests** — keine direkten Pushes auf `main`.
4. **CI muss grün sein** vor dem Merge (Manifest-Validierung, YAML-Lint, Shellcheck, Security-Scan).
5. **Domain-Konfiguration ist zentral** in `k3d/configmap-domains.yaml`. Keine hartkodierten Hostnamen in Manifesten.
6. **Secrets liegen in `k3d/secrets.yaml`** (nur Dev-Werte). Niemals echte Credentials committen.
7. **Tests laufen gegen den lokalen k3d-Cluster** via `./tests/runner.sh local`.
