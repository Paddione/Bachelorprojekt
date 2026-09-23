#!/usr/bin/env bats
# tests/spec/local-dev-mesh/k3d-tooling-removed.bats — T900310, T900332
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
  command -v jq >/dev/null 2>&1 || skip "jq binary not installed"
  # --json statt Textliste: die Textausgabe traegt ANSI-Farbcodes, sobald die
  # Umgebung Farbe erzwingt (CI), und ein zeilenverankertes Muster greift dann
  # nicht mehr [T900334].
  run bash -c 'task --list-all --json | jq -r ".tasks[].name"'
  [ "$status" -eq 0 ]

  # Positiv-Anker zuerst: der gueltige Fall muss durchlaufen.
  echo "$output" | grep -qx 'workspace:deploy'

  # Negativ-Aussagen: exakter Task-Name als ganze Zeile, damit z.B.
  # `dev:cluster:create_legacy` nicht auf `cluster:create` matcht.
  local removed=(
    'cluster:create' 'cluster:delete' 'cluster:start' 'cluster:stop' 'cluster:status'
    'workspace:up' 'dev:reset' 'website:build:import' 'einvoice-sidecar:import'
    'up' 'down'
    'dev:build:website' 'dev:build:brett' 'dev:apply' 'dev:deploy'
    'dev:_materialise-secrets'
  )
  local name
  for name in "${removed[@]}"; do
    if echo "$output" | grep -qxF "${name}"; then
      echo "unerwartet vorhanden: ${name}"
      return 1
    fi
  done

  # Keine Staging-Tasks mehr
  if echo "$output" | grep -qE '^staging:'; then
    echo "unerwartet Staging-Tasks vorhanden"
    return 1
  fi
}

@test "removed files are absent while the production kustomize base remains" {
  [ -f k3d/kustomization.yaml ]

  [ ! -e k3d-config.yaml ]
  [ ! -e k3d/create-cluster.sh ]
  [ ! -e k3d/teardown.sh ]
  [ ! -e scripts/dev-reset.sh ]
  [ ! -e scripts/dev-cluster-autostart.sh ]

  # T900332
  [ ! -e taskfiles/Taskfile.staging.yml ]
  [ ! -e scripts/staging-id.sh ]
  [ ! -e k3d/staging-stack ]
  [ ! -e k3d/dev-stack/cert-manager.yaml ]
  [ ! -e k3d/dev-stack/traefik-tls.yaml ]
  [ ! -e tests/unit/staging.bats ]
}

@test "no task imports images into k3d" {
  grep -qE '^  brett:build:' Taskfile.yml

  run grep -rn 'k3d image import' Taskfile.yml taskfiles/
  [ "$status" -eq 1 ]
}
