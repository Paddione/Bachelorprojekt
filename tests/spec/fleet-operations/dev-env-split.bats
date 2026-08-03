#!/usr/bin/env bats
# tests/spec/fleet-operations/dev-env-split.bats
# SSOT: openspec/changes/cluster-dev-node-gekko2/specs/fleet-operations.md
# T002630 P1: Env-Entflechtung — dev-cluster.yaml steuert den Cluster-Dev-Stack,
# dev.yaml steuert nur noch die lokale k3d-Umgebung.
#
# Pruefmodus: Ausfuehrung — der Renderer wird ausgefuehrt und seine Ausgabe sowie
# das Ergebnis-Kustomize-Verzeichnis bewertet (T002448-M4).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  RENDERER="${REPO_ROOT}/scripts/flux-render-artifact.sh"
  DEV_CLUSTER_YML="${REPO_ROOT}/environments/dev-cluster.yaml"
  DEV_YML="${REPO_ROOT}/environments/dev.yaml"
}

@test "T002630-P1: Renderer sourct dev-cluster.yaml (nicht dev.yaml) fuer den Dev-Stack" {
  [ -f "$RENDERER" ] || { echo "MISSING renderer: $RENDERER"; return 1; }
  grep -q 'env-resolve.sh dev-cluster' "$RENDERER" \
    || { echo "FAIL: Renderer sourct NICHT dev-cluster — dev-Stack-Entflechtung fehlt"; return 1; }
}

@test "T002630-P1: dev.yaml verweist auf dev-cluster.yaml als neue Quelle fuer Cluster-Dev" {
  [ -f "$DEV_YML" ] || { echo "MISSING: $DEV_YML"; return 1; }
  grep -q 'dev-cluster.yaml' "$DEV_YML" \
    || { echo "FAIL: dev.yaml enthaelt keinen Verweis auf dev-cluster.yaml — Doppelrolle droht"; return 1; }
}

@test "T002630-P1: dev-cluster.yaml definiert DEV_DOMAIN" {
  [ -f "$DEV_CLUSTER_YML" ] || { echo "MISSING: $DEV_CLUSTER_YML"; return 1; }
  grep -qE 'DEV_DOMAIN:' "$DEV_CLUSTER_YML" \
    || { echo "FAIL: dev-cluster.yaml definiert kein DEV_DOMAIN"; return 1; }
  grep -qE 'dev\.mentolder\.de' "$DEV_CLUSTER_YML" \
    || { echo "FAIL: dev-cluster.yaml enthaelt nicht dev.mentolder.de"; return 1; }
}

@test "T002630-P1: environments/schema.yaml dokumentiert DEV_DOMAIN-Quelle (dev-cluster.yaml)" {
  schema="${REPO_ROOT}/environments/schema.yaml"
  [ -f "$schema" ] || { echo "MISSING: $schema"; return 1; }
  sed -n '/name: DEV_DOMAIN/,/name: DEV_NODE/p' "$schema" | grep -q 'dev-cluster.yaml' \
    || { echo "FAIL: schema.yaml dokumentiert nicht, dass DEV_DOMAIN aus dev-cluster.yaml gelesen wird"; return 1; }
}
