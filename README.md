# Homeoffice MVP

Kubernetes-basierte Kollaborationsplattform für kleine Teams — Mattermost (Chat), Nextcloud (Dateien + Talk Video + Collabora Office), Keycloak (SSO) auf k3d/k3s mit Traefik Ingress.

## Schnellstart

Voraussetzungen: Docker, [k3d](https://k3d.io), kubectl, [task](https://taskfile.dev)

```bash
git clone https://github.com/Paddione/Bachelorprojekt.git && cd Bachelorprojekt

# Cluster erstellen + alle Services deployen
task cluster:create && task homeoffice:deploy
```

Services sind erreichbar unter:
- **Keycloak (SSO):** http://auth.localhost (admin / devadmin)
- **Mattermost (Chat):** http://chat.localhost
- **Nextcloud (Dateien + Talk):** http://files.localhost
- **Collabora (Office):** http://office.localhost
- **Talk HPB (Signaling):** http://signaling.localhost
- **Docs:** http://docs.localhost

## Dokumentation

| Dokument | Beschreibung |
|----------|-------------|
| [Architektur](http://docs.localhost/architecture) | Systemübersicht, Service-Diagramm, Netzwerk und Datenfluss |
| [Services](http://docs.localhost/services) | Kubernetes-Services und deren Zusammenspiel |
| [Keycloak & SSO](http://docs.localhost/keycloak) | Identity Management, OIDC-Clients |
| [Migration](http://docs.localhost/migration) | Import von Slack, Teams, Google Workspace |
| [Skripte](http://docs.localhost/scripts) | Referenz aller Skripte, Parameter und Befehle |
| [Tests](http://docs.localhost/tests) | Automatisiertes Test-Framework |
| [Sicherheit](http://docs.localhost/security) | Sicherheitsrichtlinien und Best Practices |
| [Fehlerbehebung](http://docs.localhost/troubleshooting) | Häufige Probleme und Lösungsansätze |
| [Anforderungen](docs/README.md) | Maschinell lesbare Anforderungsdefinitionen (JSON) |

## Architektur

```
              Traefik Ingress (Ports 80/443)
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
    ingress.yaml                # Traefik Ingress Rules
    keycloak*.yaml              # Keycloak + DB
    mattermost*.yaml            # Mattermost + DB
    nextcloud*.yaml             # Nextcloud + DB
    talk-hpb.yaml               # Nextcloud Talk HPB (Signaling + Janus + NATS)
    coturn.yaml                 # TURN/STUN Server
    collabora.yaml              # Collabora Online (Dokumentenbearbeitung)
    realm-homeoffice-dev.json   # Keycloak Realm-Konfiguration
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
