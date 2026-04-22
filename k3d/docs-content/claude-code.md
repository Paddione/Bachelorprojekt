# MCP-Server

## Übersicht

Die **MCP-Server** (Model Context Protocol) laufen als Kubernetes-Pods im Cluster und stellen Werkzeuge bereit — etwa Zugriff auf den Cluster, die Datenbank, den Browser, GitHub oder Stripe.

| Eigenschaft | Wert |
|-------------|------|
| URL | `http://ai.localhost` — MCP-Status-Dashboard (kein vollständiges KI-UI) |
| Namespace | `workspace` |
| Authentifizierung | Keycloak SSO (OIDC) |
| Sprache | Deutsch (konfiguriert im System-Prompt) |

> **Hinweis:** `http://ai.localhost` zeigt nur ein einfaches Statusdashboard. Die eigentliche KI-Interaktion erfolgt über `claude` im Terminal des Entwicklers.

---

## MCP-Server-Übersicht

Alle MCP-Server laufen als Deployments im `workspace`-Namespace. Die Verbindungs-URLs sind in `k3d/claude-code-config.yaml` definiert.

| MCP-Server | Pod / Manifest | Funktion | Standard |
|------------|---------------|----------|---------|
| **mcp-ops** (Kubernetes) | `claude-code-mcp-ops` | Kubernetes-Cluster lesen, Deployments neustarten/skalieren | aktiv |
| **mcp-ops** (PostgreSQL) | `claude-code-mcp-ops` | SQL-Lesezugriff auf shared-db | aktiv |
| **mcp-auth** (Keycloak) | `claude-code-mcp-auth` | Benutzerverwaltung, Gruppen, Rollen, Sessions | aktiv |
| **mcp-browser** (Playwright) | `mcp-browser` | Browser-Automatisierung mit headless Chromium | aktiv |
| **mcp-github** | `mcp-github` | Repos, Issues, PRs, Actions (PAT erforderlich) | inaktiv (replicas: 0) |
| **mcp-stripe** | `claude-code-mcp-stripe` | Zahlungen, Rechnungen, Abonnements | aktiv |
| **mcp-grafana** | `mcp-grafana` | Grafana-Dashboards und Metriken | inaktiv (replicas: 0) |
| **mcp-prometheus** | `mcp-prometheus` | Prometheus-Abfragen | inaktiv (replicas: 0) |
| **mcp-kubernetes** (standalone) | `mcp-kubernetes` | Read-Only Kubernetes-Inspektion | aktiv |
| **mcp-postgres** (standalone) | `mcp-postgres` | Read-Only PostgreSQL-Zugriff | aktiv |

Die URLs der MCP-Server (`claude-code-config.yaml`):

```yaml
MCP_KUBERNETES_URL: "http://claude-code-mcp-ops:8080/mcp"
MCP_POSTGRES_URL:   "http://claude-code-mcp-ops:3001/mcp"
MCP_MEETINGS_URL:   "http://claude-code-mcp-ops:3002/mcp"
MCP_KEYCLOAK_URL:   "http://claude-code-mcp-auth:8080/mcp/sse"
MCP_BROWSER_URL:    "http://mcp-browser:3000/mcp"
MCP_GITHUB_URL:     "http://mcp-github:3002/mcp"
MCP_STRIPE_URL:     "http://claude-code-mcp-stripe:3003/mcp"
```

---

## RBAC & Kubernetes-Zugriff

Claude Code nutzt den ServiceAccount `claude-code-agent` (definiert in `k3d/claude-code-rbac.yaml`). Die ClusterRole legt fest, was Claude Code im Cluster erlaubt ist und was nicht.

### Erlaubte Operationen (read)

| Ressourcen | Verben |
|------------|--------|
| Pods, Pod-Logs, Services, Endpoints, ConfigMaps, PVCs, Namespaces, Nodes, Events, ServiceAccounts | `get`, `list`, `watch` |
| Deployments, ReplicaSets, StatefulSets, DaemonSets | `get`, `list`, `watch` |
| Jobs, CronJobs | `get`, `list`, `watch` |
| Ingresses, NetworkPolicies | `get`, `list`, `watch` |
| HorizontalPodAutoscalers | `get`, `list`, `watch` |

### Erlaubte Operationen (write)

| Ressourcen | Verben |
|------------|--------|
| Deployments | `patch`, `update` (Neustart, Rolling Update) |
| Deployments/scale | `get`, `patch`, `update` (Skalierung) |

### Explizit verboten (durch Weglassen)

- **Secrets lesen** — kein Zugriff auf Passwörter oder API-Keys im Cluster
- **pods/exec** — keine Shell-Verbindung in Container
- **Löschen** — keine Pods, Deployments, Namespaces oder PVCs löschen
- **Erstellen** — keine neuen Ressourcen anlegen (außer via `patch`)

---

## System-Prompt

Der System-Prompt (`claude-code/system-prompt.md`) konfiguriert Claude Code für dieses Projekt. Er enthält:

- **Projektbeschreibung** — alle Dienste der Workspace-Plattform mit Subdomains
- **MCP-Tool-Referenz** — welche Werkzeuge verfügbar sind und wann sie eingesetzt werden
- **Verhaltensregeln** — bevorzugt Deutsch, freundlich und kompetent
- **Sicherheitshinweise** — Claude Code darf keine Secrets lesen und keine Container-Shells öffnen

> Der System-Prompt wird bei jedem Start von Claude Code geladen und gibt dem Assistenten den vollständigen Plattformkontext.

---

## MCP-Aktionskatalog

### Kubernetes (`mcp-ops` / `mcp-kubernetes`)

**Konfiguration**

| Aktion | Beschreibung |
|--------|-------------|
| `configuration_contexts_list` | Alle verfügbaren kubeconfig-Kontexte auflisten |
| `configuration_view` | Aktuelle kubeconfig-YAML anzeigen |

**Namespaces & Events**

| Aktion | Beschreibung |
|--------|-------------|
| `namespaces_list` | Alle Namespaces im Cluster auflisten |
| `events_list` | Cluster-Events (Warnungen, Fehler) zur Fehlersuche auflisten |

**Nodes**

| Aktion | Beschreibung |
|--------|-------------|
| `nodes_top` | CPU-/Speicherverbrauch der Nodes anzeigen |
| `nodes_stats_summary` | Detaillierte Node-Statistiken: CPU, Speicher, Netzwerk |
| `nodes_log` | Logs eines Nodes abrufen (kubelet, kube-proxy) |

**Pods**

| Aktion | Beschreibung |
|--------|-------------|
| `pods_list` | Alle Pods über alle Namespaces auflisten |
| `pods_list_in_namespace` | Pods in einem bestimmten Namespace auflisten |
| `pods_get` | Vollständiges Manifest eines Pods abrufen |
| `pods_log` | Logs eines Pods oder Containers ansehen |
| `pods_top` | CPU-/Speicherverbrauch der Pods anzeigen |

**Ressourcen (generisch)**

| Aktion | Beschreibung |
|--------|-------------|
| `resources_list` | Beliebige Kubernetes-Ressource auflisten (Deployments, Services, Ingresses usw.) |
| `resources_get` | Bestimmte Ressource nach apiVersion, kind und Name abrufen |
| `resources_create_or_update` | YAML/JSON-Manifest anwenden (erstellen oder aktualisieren) |
| `resources_scale` | Replica-Anzahl eines Deployments oder StatefulSets abfragen oder setzen |

> Die standalone `mcp-kubernetes`-Variante ist **read-only** — kein Erstellen, Aktualisieren, Löschen oder Exec.

---

### PostgreSQL (`mcp-postgres`)

Direkter SQL-Zugriff auf `shared-db` (PostgreSQL 16) im Cluster. Alle Workspace-Datenbanken (Keycloak, Nextcloud, Website) liegen auf dieser gemeinsamen Instanz.

| Aktion | Beschreibung |
|--------|-------------|
| `query` | SQL-Abfrage (nur lesend) gegen die gemeinsame Datenbank ausführen |

> Ausschließlich `SELECT`-Abfragen — keine Datenmanipulation.

---

### Playwright Browser (`mcp-browser`)

Vollständige Browser-Automatisierung via `@playwright/mcp` (Microsoft). Führt headloses Chromium im Cluster aus. Aktionen nutzen ein **Accessibility-Snapshot-Modell** — `browser_snapshot` liefert eine strukturierte DOM-Referenz, Interaktionen adressieren Elemente über ihre `ref`.

**Navigation**

| Aktion | Beschreibung |
|--------|-------------|
| `browser_navigate` | Zu einer URL navigieren |
| `browser_navigate_back` | Zurück zur vorherigen Seite |
| `browser_wait_for` | Auf Text warten oder N Sekunden pausieren |

**Seiten-Inspektion**

| Aktion | Beschreibung |
|--------|-------------|
| `browser_snapshot` | Accessibility-Tree der aktuellen Seite erfassen |
| `browser_take_screenshot` | Screenshot des Viewports oder eines Elements |
| `browser_console_messages` | Browser-Konsolennachrichten abrufen |
| `browser_network_requests` | Netzwerk-Requests seit Seitenladung auflisten |

**Interaktion**

| Aktion | Beschreibung |
|--------|-------------|
| `browser_click` | Element anklicken |
| `browser_type` | Text in ein Eingabefeld eingeben |
| `browser_fill_form` | Mehrere Formularfelder gleichzeitig ausfüllen |
| `browser_select_option` | Dropdown-Option auswählen |
| `browser_drag` | Drag-and-Drop zwischen zwei Elementen |
| `browser_file_upload` | Datei über einen File-Chooser hochladen |
| `browser_handle_dialog` | Browser-Dialog bestätigen oder abbrechen |
| `browser_evaluate` | JavaScript auf der Seite ausführen |

> Typischer Ablauf: `browser_navigate` → `browser_snapshot` → Interaktion → `browser_take_screenshot` zur Verifikation.

---

### Keycloak (`mcp-auth`)

Image: `quay.io/sshaaf/keycloak-mcp-server`. Verwendet SSE-Transport. Erfordert ein gültiges Keycloak-Bearer-Token bei jedem Request.

| Bereich | Abdeckung |
|---------|-----------|
| Benutzer | Benutzer erstellen, lesen, aktualisieren, löschen; Passwörter zurücksetzen |
| Gruppen | Gruppen und Mitgliedschaften verwalten |
| Rollen | Realm-/Client-Rollen zuweisen und verwalten |
| Clients | OIDC-Clients auflisten und inspizieren |
| Sessions | Aktive Sessions auflisten und widerrufen |
| Realms | Realm-Konfiguration inspizieren |

---

### GitHub (`mcp-github`)

Image: `ghcr.io/github/github-mcp-server` (offizieller GitHub MCP-Server). **Standardmäßig deaktiviert** (`replicas: 0`) — erfordert einen gültigen GitHub Personal Access Token (PAT).

| Bereich | Abdeckung |
|---------|-----------|
| Repositories | Auflisten, suchen, Repo-Details abrufen |
| Issues | Issues erstellen, lesen, aktualisieren, kommentieren |
| Pull Requests | PRs erstellen, auflisten, reviewen, mergen |
| Code | Code durchsuchen, Dateiinhalte lesen, Commits abrufen |
| Actions | Workflow-Läufe und Jobs auflisten |
| Releases | Releases auflisten und abrufen |

PAT setzen:

```bash
task mcp:set-github-pat -- <token>
```

---

### Stripe (`mcp-stripe`)

Image: `@stripe/agent-toolkit` (offizieller Stripe MCP). Erfordert einen Stripe Secret Key in `workspace-secrets`.

| Bereich | Abdeckung |
|---------|-----------|
| Kunden | Kunden erstellen, auflisten, abrufen |
| Zahlungsabsichten | Payment Intents erstellen und bestätigen |
| Rechnungen | Rechnungen erstellen, senden, stornieren |
| Abonnements | Abonnements erstellen und verwalten |
| Produkte & Preise | Produktkatalog und Preisgestaltung verwalten |
| Rückerstattungen | Rückerstattungen ausstellen und auflisten |
| Kontostand | Kontostand abrufen |

---

### Grafana & Prometheus (optional)

Beide Server sind im Manifest vorhanden (`claude-code-mcp-grafana.yaml`, `claude-code-mcp-prometheus.yaml`), aber standardmäßig deaktiviert (`replicas: 0`). Sie werden aktiviert, wenn Grafana und Prometheus im Cluster deployed sind.

| Server | Funktion |
|--------|---------|
| `mcp-grafana` | Dashboards abfragen, Panels lesen, Alerting-Status prüfen |
| `mcp-prometheus` | PromQL-Abfragen ausführen, Metriken abrufen |

---

## Konfiguration

```bash
task mcp:deploy                # Alle MCP-Pods deployen
task claude-code:setup         # MCP-Server in Claude Code Datenbank registrieren
```

Die Datei `k3d/claude-code-config.yaml` (ConfigMap `claude-code-config`) definiert alle MCP-Server-URLs. Anmeldedaten für Nextcloud, Keycloak und Stripe werden aus `claude-code-secrets` bzw. `workspace-secrets` bezogen — nie direkt in der ConfigMap gespeichert.

---

## Betrieb

```bash
task mcp:deploy                      # Alle MCP-Pods deployen
task mcp:status                      # Status aller MCP-Pods anzeigen
task mcp:logs -- core/mcp-server     # Logs eines bestimmten Containers
task mcp:restart -- core             # MCP-Pod neu starten
task mcp:select                      # Interaktiver MCP-Server-Selektor
task mcp:set-github-pat -- <token>   # GitHub PAT in claude-code-secrets aktualisieren
```

MCP-Pods direkt mit kubectl prüfen:

```bash
kubectl get pods -n workspace -l app=claude-code-mcp-ops
kubectl logs -n workspace deployment/claude-code-mcp-ops -c mcp-kubernetes
kubectl describe pod -n workspace <pod-name>
```

---

## Fehlerbehebung

| Problem | Ursache | Lösung |
|---------|---------|--------|
| MCP-Pod nicht bereit | Init-Container schlägt fehl | `kubectl describe pod` und Init-Container-Logs prüfen |
| Kubernetes-Zugriff verweigert | RBAC-ClusterRole zu restriktiv | `k3d/claude-code-rbac.yaml` prüfen, `kubectl auth can-i` nutzen |
| Claude Code verbindet nicht | Falsche MCP-Server-URL | `claude-code-config.yaml` prüfen; Pod erreichbar? (`kubectl port-forward`) |
| GitHub-Aktionen schlagen fehl | PAT abgelaufen oder fehlt | `task mcp:set-github-pat -- <neuer-token>` |
| Keycloak-Aktionen scheitern | Bearer-Token ungültig | Neues Token von Keycloak holen; SSE-Transport erfordert gültige Session |
| Nextcloud-Aktionen schlagen fehl | Falsche Anmeldedaten | `claude-code-secrets` prüfen: `NEXTCLOUD_USERNAME`, `NEXTCLOUD_PASSWORD` |
| Grafana/Prometheus nicht erreichbar | `replicas: 0` | Manifest anpassen (`replicas: 1`) und `task mcp:deploy` ausführen |
