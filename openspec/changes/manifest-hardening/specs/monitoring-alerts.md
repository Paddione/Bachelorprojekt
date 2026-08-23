## ADDED Requirements

### Requirement: Monitoring-Hauptcontainer haben Resource Requests und Limits

Der Prod-Patch `prod/monitoring/resource-limits-patch.yaml` MUSS über den bestehenden
Grafana-Block hinaus folgende Workloads mit `resources.requests` (cpu, memory) und
`resources.limits` (cpu, memory) versorgen:

- Deployment `monitoring-grafana`: Sidecar-Container `grafana-sc-dashboard` und
  `grafana-sc-datasources` (strategic merge ergänzt Listeneinträge per Container-Namen)
- DaemonSet `monitoring-prometheus-node-exporter`: Container `node-exporter`
  (Achtung: eigener `kind: DaemonSet`-Patch, nicht Deployment)
- Deployment `monitoring-kube-state-metrics`: Hauptcontainer
- Deployment `monitoring-operator`: Container `kube-prometheus-stack`

Die Werte folgen der Größenordnung der bestehenden Blöcke in
`k3d/monitoring/values/kube-prometheus-stack-prod-values.yaml`.

#### Scenario: Patch deckt alle Hauptcontainer ab

- **GIVEN** die Datei `prod/monitoring/resource-limits-patch.yaml`
- **WHEN** die deklarierten Patches geprüft werden
- **THEN** existieren Einträge für grafana-sidecars (grafana-sc-dashboard,
  grafana-sc-datasources), node-exporter (DaemonSet), kube-state-metrics und den
  operator (kube-prometheus-stack), jeweils mit requests und limits
