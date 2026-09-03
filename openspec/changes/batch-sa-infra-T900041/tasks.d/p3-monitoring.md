---
title: "p3-monitoring — blackbox-exporter + Grafana (T900034)"
ticket_id: T900034
domains: [fleet-operations]
status: active
target_files: ["k3d/monitoring/blackbox-exporter.yaml", "k3d/monitoring/kube-prometheus-stack-rendered.yaml"]
---

# p3-monitoring — blackbox-exporter + Grafana (T900034)

## Goal

Das Monitoring ist seit 11d (blackbox-exporter) / 3d8h (Grafana) selbst ausgefallen. Deshalb blieben
die PROD-Ausfaelle von Vaultwarden + Penpot unbemerkt. Beide Dienste muessen wieder laufen, damit
Blackbox-Probes und Alerts wieder greifen.

## Root-Cause / Befund

- `blackbox-exporter` (namespace `monitoring`, 3745x Event): "container has runAsNonRoot and image
  will run as root". `k3d/monitoring/blackbox-exporter.yaml` setzt auf Pod-Ebene
  `runAsNonRoot: true` (Z.15), aber keinen `runAsUser`. Das Image
  `quay.io/prometheus/blackbox-exporter:v0.27.0` startet als root → Kollision.
- `monitoring-grafana` (3d8h) haengt in `Init:0/1`; Ursache zu verifizieren (Init-Container in
  `k3d/monitoring/kube-prometheus-stack-rendered.yaml`, ggf. Sidecar/Init-Pull oder -Error).

## File Structure

```
k3d/monitoring/blackbox-exporter.yaml               # MODIFIED: runAsUser: 65534 (o. nonroot Image)
k3d/monitoring/kube-prometheus-stack-rendered.yaml  # MODIFIED: Grafana-Init-Hang beheben
tests/spec/fleet-operations/monitoring-ready.bats   # NEW (in p7): Guard
```

## Tasks

1. **Investigate (blackbox):** Bestaetigen mit
   `kubectl --context fleet -n monitoring get deploy blackbox-exporter -o yaml` die aktuelle
   SecurityContext-Vorgabe; Log/Event-Evidenz fuer runAsNonRoot-Kollision sammeln.
2. **Fix (blackbox):** `runAsUser: 65534` zum Pod-/Container-SecurityContext ergaenzen (oder Image
   auf nonroot-Variante wechseln, vorzugsweise runAsUser-Ansatz, minimal-invasiv). `readOnlyRootFilesystem:
   true` auf Kompatibilitaet mit dem Config-Dir pruefen (ConfigMap ist nur read; `--config.file`
   liegt unter /etc/blackbox, koennte ro RootFS store-kompatibel sein — bei Write-Problem read-only
   partiell loesen).
3. **Investigate (Grafana):** `kubectl --context fleet -n monitoring logs monitoring-grafana-* -c
   <init>` pruefen; Init:0/1-Hang-Ursache (Image-Pull, dependency auf Datasources-Secret, fehlendes
   `monitoring-grafana` Secret, Sidecar-Dashboard-Permission) bestimmen.
4. **Fix (Grafana):** Ursache in `k3d/monitoring/kube-prometheus-stack-rendered.yaml` (und ggf.
   `values/kube-prometheus-stack-prod-values.yaml`) beheben; Grafana-Init muss abschliessen, Pod
   Ready.
5. **Verify:** blackbox-exporter Running ohne CreateContainerConfigError; Grafana Ready;
   `curl` gegen die blackbox-Probe-URL und `grafana.<domain>` liefert 200.

## Verify

Der BATS-Guard `monitoring-ready.bats` prueft, dass der blackbox-exporter-Pod-Spec einen
non-root-kompatiblen SecurityContext (runAsUser) traegt:

```bash
# Requirement: Monitoring ist wieder verfügbar
# expected: FAIL (vor dem Fix fehlt runAsUser, Event runAsNonRoot/root)
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/monitoring-ready.bats
```
