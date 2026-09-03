#!/usr/bin/env bats
# tests/spec/fleet-operations/monitoring-ready.bats
# SSOT: openspec/specs/fleet-operations.md
# Ticket: T900034 (Batch T900041)
#
# PRUEFMODUS: Quelltext (Manifest-Konfiguration). Ausnahmefall der
# Test-Resultats-Konvention (T002448-M4): beide Defekte sitzen in der
# PodSpec selbst, ein Laufzeit-Test braeuchte Cluster-Zugang, den CI nicht hat.
#
# Zwei Befunde, beide am 2026-09-03 gegen den fleet-Cluster verifiziert:
#
# 1. blackbox-exporter: 11d in CreateContainerConfigError, 3745 Events
#    "container has runAsNonRoot and image will run as root". Die PodSpec setzte
#    runAsNonRoot: true, aber keinen runAsUser — und
#    quay.io/prometheus/blackbox-exporter startet als root. Kubelet lehnt den
#    Container ab, bevor er laeuft.
#
# 2. monitoring-grafana: 3d14h in Init:0/1. Ursache ist NICHT der
#    Init-Container, sondern strategy.type=RollingUpdate auf einem Deployment
#    mit ReadWriteOnce-PVC (monitoring-grafana, longhorn): der alte Pod
#    (monitoring-grafana-75446f4f68, 3/3 Running, 30d) haelt das Volume, der
#    neue haengt im Volume-Attach fest. Klassischer RWO-Rollout-Deadlock;
#    die Aufloesung ist strategy.type=Recreate.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  BB="${REPO_ROOT}/k3d/monitoring/blackbox-exporter.yaml"
  KPS="${REPO_ROOT}/k3d/monitoring/kube-prometheus-stack-rendered.yaml"
}

@test "T900034: blackbox-exporter-PodSpec setzt runAsUser passend zu runAsNonRoot" {
  [ -f "$BB" ]

  # Positiv-Anker (T002356-M1): die Deklaration, gegen die der Guard laeuft,
  # existiert ueberhaupt. Ohne ihn waere die Aussage unten vakuos, sobald
  # jemand den securityContext ganz entfernt.
  run grep -c 'runAsNonRoot: true' "$BB"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]

  # Der Guard: runAsNonRoot ohne runAsUser laesst das Kubelet den Container
  # ablehnen, weil das Image root als USER deklariert.
  run grep -c 'runAsUser:' "$BB"
  [ "$status" -eq 0 ] || { echo "blackbox-exporter.yaml deklariert keinen runAsUser" >&2; return 1; }
  [ "$output" -ge 1 ]

  # 65534 (nobody) ist der Wert, den die uebrigen non-root-Workloads des Repos
  # verwenden — z.B. prod/reflector.yaml und k3d/cronjob-scheduled-publish.yaml.
  run grep -c 'runAsUser: 65534' "$BB"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "T900034: Grafana-Deployment nutzt Recreate statt RollingUpdate (RWO-PVC)" {
  [ -f "$KPS" ]

  # Positiv-Anker: das Grafana-Deployment existiert im gerenderten Chart.
  run grep -c '^  name: monitoring-grafana$' "$KPS"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]

  # Der Guard: die strategy des Grafana-Deployments. Die Datei enthaelt viele
  # Deployments, deshalb wird der Block auf das Grafana-Deployment eingegrenzt
  # (T003104: keine Dokumentposition, sondern ein Bereichsmuster) — vom
  # 'name: monitoring-grafana' bis zum naechsten Dokumenttrenner.
  local strategy
  strategy="$(awk '/^  name: monitoring-grafana$/,/^---$/' "$KPS" | grep -A1 '^  strategy:$' | tail -1)"
  [ -n "$strategy" ] || { echo "kein strategy-Block im Grafana-Deployment gefunden" >&2; return 1; }
  [[ "$strategy" == *"Recreate"* ]] \
    || { echo "Grafana-strategy ist '${strategy}' statt Recreate — RWO-PVC-Rollout blockiert" >&2; return 1; }
}
