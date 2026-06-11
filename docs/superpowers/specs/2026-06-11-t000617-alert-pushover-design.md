# Spec: Grafana Alert-Regeln + Pushover-Benachrichtigungen (T000617)

**Datum:** 2026-06-11  
**Ticket:** T000617  
**Branch:** feature/T000617-alert-pushover  
**Status:** staged

---

## Problemstellung

Das Workspace-MVP auf dem fleet-Cluster (pk-hetzner-4/6/8) hat **kein Monitoring-System**.
Pod-Abstürze, CPU-Spitzen, Speicher-Erschöpfung und hohe 5xx-Fehlerrate werden nicht
automatisch erkannt und gemeldet. Der Betreiber erfährt Ausfälle erst durch Nutzerbeschwerden.
Pushover ist bereits als App auf dem Gerät installiert — der Notification-Channel ist bereit.

---

## Lösung: kube-prometheus-stack im `monitoring`-Namespace

Ein einzelner Monitoring-Stack beobachtet **beide Brands** (mentolder + korczewski).
Alertmanager routet Benachrichtigungen nach Pushover mit brand-spezifischen Labels.

### Architektur-Entscheidung: kube-prometheus-stack (Helm, pre-rendered)

**Gewählt:** Helm-Chart `kube-prometheus-stack` (Prometheus Community), via `helm template`
pre-gerendert und als committed YAML in `k3d/monitoring/` gehalten.

**Gründe:**
- Enthält Prometheus + Grafana + Alertmanager + Node-Exporter + kube-state-metrics in einem Chart
- PrometheusRule CRD: deklarative Alert-Regeln, gitops-freundlich
- Alertmanager hat nativen Pushover-Support (`pushover_configs`) seit v0.25
- Kein Helm-Operator im Cluster nötig — bleibt im push-basierten Deploy-Modell
- Pre-rendered YAML ist vollständig auditierbar (kein "magic" zur Laufzeit)

**Verworfen:**
- Einzelne Prometheus + Grafana YAML: mehr Boilerplate, kein Auto-Wiring der CRDs
- Grafana Cloud / externe Observability-Plattform: DSGVO-Problem (On-Premises-Anforderung)
- Flux HelmRelease: Flux wurde vollständig entfernt (PR #1282)

### Namespace-Entscheidung: `monitoring`

Separater `monitoring`-Namespace (nicht `workspace`), weil:
- Cluster-weite Metriken scrapen beide Brand-Namespaces (`workspace` + `workspace-korczewski`)
- Saubere RBAC-Trennung: ClusterRole für Prometheus-Scraping ist Namespace-unabhängig
- Upgrade/Restart des Monitoring-Stacks berührt nicht die Brand-Workloads

### Multi-Brand-Strategie: Ein Stack, zwei Namespaces gescrapt

- Ein Prometheus scrapt `workspace` **und** `workspace-korczewski` via `namespaceSelector`
- Alert-Labels enthalten `namespace` als automatischen Brand-Indikator
- Alertmanager-Routing: alle Alerts → Pushover (kein Split nötig, da ein Betreiber)
- Grafana-Dashboards: je ein Dashboard mit `namespace`-Variable (Brand-Filter)

---

## Alert-Regeln (5 Pflicht-Alerts)

### 1. PodCrashLoopBackOff

```yaml
alert: PodCrashLoopBackOff
expr: |
  kube_pod_container_status_waiting_reason{
    reason="CrashLoopBackOff",
    namespace=~"workspace|workspace-korczewski"
  } > 0
for: 5m
labels:
  severity: critical
annotations:
  summary: "Pod {{ $labels.pod }} in CrashLoopBackOff ({{ $labels.namespace }})"
  description: "Container {{ $labels.container }} crasht wiederholt seit 5 Minuten."
```

**Metrik-Quelle:** `kube-state-metrics` (im Stack enthalten)  
**Verzögerung:** 5 Minuten (kurzfristige Restarts filtern)

### 2. HighCPUUsage

```yaml
alert: HighCPUUsage
expr: |
  (
    sum by (namespace, pod, container) (
      rate(container_cpu_usage_seconds_total{
        namespace=~"workspace|workspace-korczewski",
        container!=""
      }[5m])
    )
    /
    sum by (namespace, pod, container) (
      kube_pod_container_resource_limits{
        namespace=~"workspace|workspace-korczewski",
        resource="cpu"
      }
    )
  ) > 0.8
for: 5m
labels:
  severity: warning
annotations:
  summary: "Hohe CPU-Auslastung: {{ $labels.pod }} ({{ $labels.namespace }})"
  description: "CPU-Auslastung > 80% für 5 Minuten: {{ $value | humanizePercentage }}"
```

**Fallback wenn kein CPU-Limit gesetzt:** Metriken ohne Limit-Denominator fallen durch
→ in der Implementierung werden fehlende Limits via `on()` Join-Guard abgefangen;
Pods ohne Limit werden separat via `container_cpu_usage_seconds_total > 0.8` (absolut)
als low-priority-Alert gefeuert.

### 3. HighMemoryUsage

```yaml
alert: HighMemoryUsage
expr: |
  (
    container_memory_working_set_bytes{
      namespace=~"workspace|workspace-korczewski",
      container!=""
    }
    /
    kube_pod_container_resource_limits{
      namespace=~"workspace|workspace-korczewski",
      resource="memory"
    }
  ) > 0.9
for: 5m
labels:
  severity: warning
annotations:
  summary: "Hohe Memory-Auslastung: {{ $labels.pod }} ({{ $labels.namespace }})"
  description: "Memory > 90% des Limits: {{ $value | humanizePercentage }}"
```

### 4. HighDiskUsage

```yaml
alert: HighDiskUsage
expr: |
  (
    kubelet_volume_stats_used_bytes
    /
    kubelet_volume_stats_capacity_bytes
  ) > 0.85
for: 5m
labels:
  severity: warning
annotations:
  summary: "Hohe Disk-Auslastung: PVC {{ $labels.persistentvolumeclaim }}"
  description: "PVC-Auslastung > 85%: {{ $value | humanizePercentage }}"
```

**Scope:** Alle PVCs im Cluster (Longhorn + local-path), beide Namespaces inkl. `monitoring`.

### 5. High5xxErrorRate

```yaml
alert: High5xxErrorRate
expr: |
  (
    sum by (router) (
      rate(traefik_router_requests_total{code=~"5.."}[5m])
    )
    /
    sum by (router) (
      rate(traefik_router_requests_total[5m])
    )
  ) > 0.01
for: 5m
labels:
  severity: warning
annotations:
  summary: "Hohe 5xx-Rate auf Router {{ $labels.router }}"
  description: "Mehr als 1% HTTP-5xx-Fehler für 5 Minuten: {{ $value | humanizePercentage }}"
```

**Voraussetzung:** Traefik muss Prometheus-Metriken exponieren. Die k3s-integrierte Traefik-
Installation hat Prometheus-Metrics standardmäßig **nicht** aktiviert. Sie werden via
`HelmChartConfig` (k3s-nativ) oder `additionalArguments` aktiviert:
```yaml
# k3d/traefik-metrics.yaml — HelmChartConfig um Prometheus zu aktivieren
apiVersion: helm.cattle.io/v1
kind: HelmChartConfig
metadata:
  name: traefik
  namespace: kube-system
spec:
  valuesContent: |
    metrics:
      prometheus:
        entryPoint: metrics
    ports:
      metrics:
        port: 9101
        expose: false
        exposedPort: 9101
```

---

## Pushover-Konfiguration (Alertmanager)

### Alertmanager-Receiver

```yaml
receivers:
  - name: pushover
    pushover_configs:
      - token: ${PUSHOVER_TOKEN}       # App-Token
        user_key: ${PUSHOVER_USER}     # User-Key
        title: '{{ template "pushover.title" . }}'
        message: '{{ template "pushover.message" . }}'
        priority: '{{ if eq .GroupLabels.severity "critical" }}1{{ else }}0{{ end }}'
        retry: 30s     # nur bei priority=1 (critical)
        expire: 3600   # nur bei priority=1 (critical)
        url: '{{ template "pushover.url" . }}'
        url_title: 'Grafana öffnen'
```

**Routing:**
- `severity: critical` → `priority: 1` (Pushover bestätigt den Alert, wiederholt bis
  bestätigt, max. 1h)
- `severity: warning` → `priority: 0` (normale Benachrichtigung, kein Retry)
- `groupBy: [alertname, namespace]` — fasst Alerts derselben Ursache zusammen
- Resolve-Benachrichtigung: aktiviert (`send_resolved: true`)

### Secrets-Handling

`PUSHOVER_TOKEN` und `PUSHOVER_USER` sind bereits in `environments/schema.yaml` als
`required: false` registriert. Für Alertmanager werden sie zu `required: true` geändert
(Monitoring ohne Pushover-Keys macht keinen Sinn).

Prod-Secret-Flow:
1. Schlüssel in `environments/.secrets/mentolder.yaml` + `environments/.secrets/korczewski.yaml`
   eintragen (gemeinsame App, ein User-Key)
2. `task env:seal ENV=mentolder && task env:seal ENV=korczewski`
3. SealedSecret wird in Alertmanager-Deployment als Env-Var gemountet

---

## Grafana-Konfiguration

### Zugang: Keycloak OIDC SSO

Konsistent mit allen anderen Services (Nextcloud, Vaultwarden, etc.) authentifiziert
Grafana via Keycloak OIDC.

```ini
[auth.generic_oauth]
enabled = true
name = Keycloak
client_id = grafana
client_secret = ${GRAFANA_OIDC_SECRET}
scopes = openid email profile
auth_url = https://auth.mentolder.de/realms/workspace/protocol/openid-connect/auth
token_url = https://auth.mentolder.de/realms/workspace/protocol/openid-connect/token
api_url   = https://auth.mentolder.de/realms/workspace/protocol/openid-connect/userinfo
role_attribute_path = contains(groups[*], 'admins') && 'Admin' || 'Viewer'
```

Für korczewski: analoge `auth.korczewski.de`-URLs.

Da Grafana eine Instanz für beide Brands ist, wird der mentolder-Keycloak-Realm für
Admin-Zugang genutzt (Betreiber ist in beiden Realms als Admin registriert).

### Dashboards (vorprovisioniert via ConfigMap)

1. **Kubernetes Cluster Overview** (Grafana.com ID 7249 oder ähnlich)  
   Variable: `namespace` → ermöglicht Brand-Filter
2. **Traefik Dashboard** (offizielle Grafana Community-Dashboard)
3. **Alert-Status-Dashboard** (custom, zeigt aktive/stumme Alerts)

Dashboards werden als ConfigMap mit `grafana.sidecar.dashboards.enabled: true` geladen
(kube-prometheus-stack Feature — JSON-ConfigMaps werden automatisch importiert).

### Ingress

| Brand | URL |
|-------|-----|
| mentolder | `https://grafana.mentolder.de` |
| korczewski | `https://grafana.korczewski.de` |
| dev (k3d) | `http://grafana.localhost` |

Traefik-IngressRoute mit TLS-Termination (cert-manager, wie alle anderen Services).

---

## Kustomize-Struktur

```
k3d/monitoring/
├── kustomization.yaml          # Basis: Namespace + ConfigMaps + Monitoring-Core
├── namespace.yaml              # kind: Namespace, name: monitoring
├── traefik-metrics.yaml        # HelmChartConfig: aktiviert Traefik-Prometheus-Metrics
├── prometheus-rules.yaml       # PrometheusRule CR: die 5 Alert-Regeln
├── alertmanager-config.yaml    # AlertmanagerConfig CR: Pushover-Receiver + Routing
├── grafana-ingress.yaml        # IngressRoute: grafana.localhost (dev)
├── grafana-dashboards/
│   ├── kustomization.yaml
│   ├── kubernetes-overview.json  # vorprovisioniertes Dashboard
│   └── traefik-dashboard.json
└── values/
    ├── kube-prometheus-stack-dev-values.yaml    # slim für k3d
    └── kube-prometheus-stack-prod-values.yaml   # Longhorn PVC, OIDC, full resources

prod/monitoring/
├── kustomization.yaml          # Prod-Patches
├── storage-class-patch.yaml    # storageClass: longhorn (statt local-path)
├── grafana-ingress-patch.yaml  # prod Hosts (mentolder.de / korczewski.de)
└── resource-limits-patch.yaml  # prod resource requests/limits

prod-fleet/mentolder/kustomization.yaml  ← + resources: ../../prod/monitoring
prod-fleet/korczewski/kustomization.yaml ← + resources: ../../prod/monitoring
                                            + patch: grafana host → korczewski.de
```

**Pre-render-Prozess:**
```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm template monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  -f k3d/monitoring/values/kube-prometheus-stack-dev-values.yaml \
  > k3d/monitoring/kube-prometheus-stack-rendered.yaml
```
Die gerenderte YAML wird committed (einmalig, bei Helm-Chart-Upgrade wiederholen).
Ein `task monitoring:render` Task dokumentiert und automatisiert diesen Schritt.

---

## Dev-Cluster (k3d) — abgespeckte Konfiguration

Im k3d-Dev-Cluster läuft ein minimaler Monitoring-Stack:
- Prometheus mit kurzem Retention (24h)
- Alertmanager im "dry-run"-Modus: Pushover-Receiver deaktiviert (kein `PUSHOVER_TOKEN` in Dev)
- Grafana mit lokaler Auth (kein OIDC in Dev)
- Node-Exporter: läuft, aber nur für Metric-Verfügbarkeit (keine Disk-Alerts in Dev)
- Kein Longhorn in Dev → `storageClass: local-path` für Prometheus/Grafana PVCs

---

## RBAC & NetworkPolicy

### ClusterRole für Prometheus

Prometheus benötigt ClusterRole für Pod/Service/Node-Discovery:
```yaml
rules:
  - apiGroups: [""]
    resources: [nodes, nodes/metrics, services, endpoints, pods]
    verbs: [get, list, watch]
  - nonResourceURLs: [/metrics, /metrics/cadvisor]
    verbs: [get]
```

### NetworkPolicy (monitoring → workspace)

Der `monitoring`-Namespace muss aus `workspace` und `workspace-korczewski` scrapen dürfen:
```yaml
# In k3d/ als separate allow-egress Policy für monitoring-Namespace
kind: NetworkPolicy
# Allow Prometheus → workspace:* scraping
# Allow Alertmanager → Pushover (extern, kein egress-Block im monitoring-Namespace)
```

Der bestehende `website`-Namespace hat einen `default-deny`-Egress. Der `monitoring`-
Namespace erhält ebenfalls eine NetworkPolicy, die nur bekannte Scrape-Ziele + externe
Pushover-API zulässt.

---

## Environments / Schema-Änderungen

### schema.yaml: neue/geänderte Variablen

| Variable | Typ | Änderung |
|----------|-----|----------|
| `PUSHOVER_TOKEN` | required: **true** | war `false` |
| `PUSHOVER_USER` | required: **true** | war `false` |
| `GRAFANA_OIDC_SECRET` | required: true, generate: true | **neu** |
| `GRAFANA_ADMIN_PASSWORD` | required: true, generate: true | **neu** (Fallback wenn OIDC nicht verfügbar) |

### envsubst-Registrierung

`GRAFANA_OIDC_SECRET` und `GRAFANA_ADMIN_PASSWORD` werden in Taskfile-Tasks registriert,
die Monitoring-Manifeste rendern (neuer Task `monitoring:deploy`).

---

## Keycloak OIDC Client (Grafana)

Neuer Client `grafana` im workspace-Realm:
- `clientId: grafana`
- `redirectUris: ["https://grafana.mentolder.de/*", "https://grafana.korczewski.de/*"]`
- `secret: ${GRAFANA_OIDC_SECRET}` (SealedSecret)
- Group-Claim: `role_attribute_path = contains(groups[*], 'workspace-admins') && 'Admin' || 'Viewer'`

Realm-JSON-Patch wird in `k3d/realm-workspace-dev.json` ergänzt (Dev-Realm).
Prod-Realm-Patch: via Keycloak-Admin-API im `workspace:post-setup`-Task (wie bestehende
Clients Nextcloud/Vaultwarden).

---

## Tests

### Offline Tests (BATS, `task test:all`)

```
tests/unit/T000617-alert-rules.bats
```

- Validiert PrometheusRule YAML (promtool check rules)
- Validiert AlertmanagerConfig YAML (amtool check-config)
- Validiert kustomize build: `kubectl kustomize k3d/monitoring/` muss valide sein

### Manifest-Tests (bereits via `task workspace:validate`)

`kustomize build prod-fleet/mentolder/` und `prod-fleet/korczewski/` müssen weiterhin
valide sein (werden automatisch in CI via `task test:all` geprüft).

### E2E-Tests (optional, Phase 2)

Playwright-Test: Grafana-Login, Alert-Rule sichtbar, Dashboard lädt.
(Out-of-scope für V1; im Plan als separate Task vermerkt.)

---

## Nicht in Scope (V1)

- Grafana Oncall / PagerDuty-Integration
- Alertmanager-Silencing-UI via Website-Admin
- Automatische Alert-Regel-Generierung aus Deployment-Annotations
- Loki / Log-Aggregation
- Tracing (Jaeger/Tempo)
- Kostenmetriken (kubecost)

---

## Rollout-Reihenfolge

1. `k3d/monitoring/` anlegen + `task workspace:validate` (offline)
2. Traefik-Metrics aktivieren via HelmChartConfig
3. `task monitoring:render` — Helm pre-render committen
4. `task env:seal ENV=mentolder && task env:seal ENV=korczewski`
5. `task workspace:deploy ENV=mentolder` (inkl. Monitoring-Namespace)
6. `task workspace:deploy ENV=korczewski`
7. Prometheus-Targets prüfen: `kubectl port-forward -n monitoring svc/prometheus 9090`
8. Grafana-Login testen: `https://grafana.mentolder.de`
9. Test-Alert feuern: `amtool alert add alertname=TestAlert severity=warning`
10. Pushover-Benachrichtigung auf Gerät bestätigen
