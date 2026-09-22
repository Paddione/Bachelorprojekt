#!/usr/bin/env bats
# tests/spec/local-dev-mesh/k3d-tooling-removed.bats — T900310
# SSOT: openspec/changes/k3d-tooling-removal/specs/local-dev-mesh.md,
# Requirement "The repository ships no local k3d cluster tooling"
#
# Pruefmodus: Test 1 ist Command-Output-Verifikation (`task --list-all`,
# Exit-Code + Zeilen-Praesenz/-Abwesenheit). Test 2 und Test 3 sind
# Querschnittspruefungen gegen Dateisystem bzw. Quelltext (T002448-M4-Ausnahme:
# das Ergebnis "Datei existiert nicht" / "String kommt in Taskfile.yml nicht vor"
# manifestiert sich ausschliesslich im Dateisystem bzw. im Quelltext selbst,
# nicht in einem Laufzeitverhalten).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  cd "$REPO_ROOT"
}

@test "removed tasks are absent from task --list-all while workspace:deploy remains" {
  command -v task >/dev/null 2>&1 || skip "task binary not installed"
  run task --list-all
  [ "$status" -eq 0 ]

  # Positiv-Anker zuerst: der gueltige Fall muss durchlaufen.
  echo "$output" | grep -qE '^\* workspace:deploy:'

  # Negativ-Aussagen: exakter Task-Name am Zeilenanfang, damit z.B.
  # `dev:cluster:create_legacy` nicht auf `cluster:create` matcht.
  local removed=(
    'cluster:create' 'cluster:delete' 'cluster:start' 'cluster:stop' 'cluster:status'
    'workspace:up' 'dev:reset' 'website:build:import' 'einvoice-sidecar:import'
    'up' 'down'
  )
  local name
  for name in "${removed[@]}"; do
    if echo "$output" | grep -qE "^\\* ${name}:"; then
      echo "unerwartet vorhanden: ${name}"
      return 1
    fi
  done
}

@test "removed files are absent while the production kustomize base remains" {
  [ -f k3d/kustomization.yaml ]

  [ ! -e k3d-config.yaml ]
  [ ! -e k3d/create-cluster.sh ]
  [ ! -e k3d/teardown.sh ]
  [ ! -e scripts/dev-reset.sh ]
  [ ! -e scripts/dev-cluster-autostart.sh ]
}

@test "no task imports images into k3d" {
  grep -qE '^  brett:build:' Taskfile.yml

  run grep -n 'k3d image import' Taskfile.yml
  [ "$status" -eq 1 ]
}
