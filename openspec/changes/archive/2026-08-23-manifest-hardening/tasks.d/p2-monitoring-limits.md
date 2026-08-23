---
title: "p2-monitoring-limits"
ticket_id: T014553
domains: [infra, monitoring]
status: active
---

# Partial p2 — Monitoring-Resource-Limits (GR-05)

Implementiert GR-05 aus `openspec/changes/manifest-hardening/proposal.md`.
Delta-Spec: `specs/monitoring-alerts.md`. Patch-basierter Ansatz (Brainstorming-
Entscheidung): das gerenderte Baseline-Manifest wird NICHT neu gerendert.

Verifizierte Workload-Namen aus `k3d/monitoring/kube-prometheus-stack-rendered.yaml`:
Deployment `monitoring-grafana` (Container `grafana`, Sidecars `grafana-sc-dashboard`
und `grafana-sc-datasources`), DaemonSet `monitoring-prometheus-node-exporter`
(Container `node-exporter`), Deployment `monitoring-kube-state-metrics` (Container
`kube-state-metrics`), Deployment `monitoring-operator` (Container
`kube-prometheus-stack`).

### Task 1: Sidecars im bestehenden Grafana-Patch ergänzen

**Files:** `prod/monitoring/resource-limits-patch.yaml`

Im vorhandenen Deployment-Block `monitoring-grafana` die Containers-Liste um zwei
strategic-merge-Einträge erweitern (Merge erfolgt per Container-`name`):

```yaml
        - name: grafana-sc-dashboard
          resources:
            requests: { cpu: 10m, memory: 64Mi }
            limits:   { cpu: 100m, memory: 128Mi }
        - name: grafana-sc-datasources
          resources:
            requests: { cpu: 10m, memory: 64Mi }
            limits:   { cpu: 100m, memory: 128Mi }
```

### Task 2: DaemonSet-Patch für node-exporter

**Files:** `prod/monitoring/resource-limits-patch.yaml`

Neues Patch-Dokument in derselben Datei (`---`-separiert) — Achtung, eigener
`kind: DaemonSet`, nicht Deployment:

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: monitoring-prometheus-node-exporter
  namespace: monitoring
spec:
  template:
    spec:
      containers:
        - name: node-exporter
          resources:
            requests: { cpu: 10m, memory: 32Mi }
            limits:   { cpu: 200m, memory: 128Mi }
```

### Task 3: kube-state-metrics und operator patchen

**Files:** `prod/monitoring/resource-limits-patch.yaml`

Zwei weitere Deployment-Patches:

```yaml
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: monitoring-kube-state-metrics
  namespace: monitoring
spec:
  template:
    spec:
      containers:
        - name: kube-state-metrics
          resources:
            requests: { cpu: 15m, memory: 64Mi }
            limits:   { cpu: 200m, memory: 256Mi }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: monitoring-operator
  namespace: monitoring
spec:
  template:
    spec:
      containers:
        - name: kube-prometheus-stack
          resources:
            requests: { cpu: 50m, memory: 128Mi }
            limits:   { cpu: 500m, memory: 512Mi }
```

Werte folgen der Größenordnung der bestehenden Blöcke in
`k3d/monitoring/values/kube-prometheus-stack-prod-values.yaml`.

### Task 4: Kustomization-Registrierung prüfen

**Files:** keine Änderung erwartet

`prod/monitoring/kustomization.yaml` referenziert `resource-limits-patch.yaml`
bereits (der Grafana-Block ist aktiv). Nur verifizieren; falls doch nicht
referenziert, wäre das ein Abweichungsbefund — dann im PR-Kommentar melden statt
still zu ergänzen (Datei liegt außerhalb dieses Partials).

## Verify

```bash
task workspace:validate
```
