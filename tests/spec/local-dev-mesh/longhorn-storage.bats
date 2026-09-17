#!/usr/bin/env bats
# tests/spec/local-dev-mesh/longhorn-storage.bats
# T900181: Longhorn 1.11.2 ist Default-Storage auf ctx devmesh; der
# Legacy-Installer (v1.7.2, ctx devc) ist ersetzt.
#
# Pruefmodus: gemischt. Die Skripte laufen im --help/--dry-run-Modus (Output-
# Verifikation); die Default-Flag-Aussage manifestiert sich im Install-Skript
# (Querschnitt, kein Live-Cluster in CI); das versions.yaml-Pinning ist eine
# Konfigurationsaussage (Ausnahme laut tests/CLAUDE.md).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  PREREQS="${REPO_ROOT}/scripts/devmesh/longhorn-prereqs.sh"
  INSTALL="${REPO_ROOT}/scripts/devmesh/longhorn-install.sh"
  LEGACY="${REPO_ROOT}/k3d/dev-cluster/longhorn-install.sh"
  VERSIONS="${REPO_ROOT}/environments/versions.yaml"
}

@test "T900181: prereqs script answers --help with exit 0" {
  [ -x "$PREREQS" ]
  run bash "$PREREQS" --help
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -qF "Usage:"
}

@test "T900181: install dry-run plans devmesh, 1.11.2 and local-path default removal" {
  [ -f "$INSTALL" ]
  run bash "$INSTALL" --dry-run
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -qF "devmesh"
  printf '%s\n' "$output" | grep -qF "1.11.2"
  printf '%s\n' "$output" | grep -qF "local-path"
}

@test "T900181: versions.yaml pins longhorn_chart 1.11.2 (positive anchor)" {
  run grep -qF "longhorn_chart: 1.11.2" "$VERSIONS"
  [ "$status" -eq 0 ]
}

@test "T900181: no devc reference remains in the devmesh longhorn scripts" {
  matches="$(grep -rlF -- "devc" "${REPO_ROOT}/scripts/devmesh/longhorn-"*.sh 2>/dev/null || true)"
  [ -n "$(ls "${REPO_ROOT}/scripts/devmesh/longhorn-"*.sh 2>/dev/null)" ]
  [ -z "$matches" ]
}

@test "T900181: legacy v1.7.2 installer is removed" {
  [ -f "$INSTALL" ]
  [ ! -e "$LEGACY" ]
}
