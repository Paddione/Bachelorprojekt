#!/usr/bin/env bats
# tests/spec/ci-cd/gitlab-mirror-workflow.bats — Push-Mirror-Workflow GitHub -> GitLab [T011790]
#
# PRUEFMODUS: Quelltext-Inspektion (nicht Output-Verifikation).
# Begruendung: Gegenstand ist, ob ein GitHub-Actions-Workflow bei main-Pushes einen
# Mirror-Push ausfuehrt. Das entscheidet GitHub anhand der YAML-Trigger; es gibt lokal
# keinen Laufzeit-Output ohne einen echten Push und ein GitLab-Zielprojekt (siehe
# design.md — CI-Konfiguration ist die T002448-M4-Ausnahme, wie bereits in
# tests/spec/ci-cd/workflow-self-trigger.bats).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  WF="${REPO_ROOT}/.github/workflows/mirror-to-gitlab.yml"
}

@test "gitlab-mirror-workflow: Datei existiert und ist nicht leer" {
  # Positiv-Anker [T002356-M1] fuer alle folgenden Tests dieser Datei.
  if [ ! -f "$WF" ]; then
    echo "erwartete Datei fehlt: $WF" >&2
    false
  fi
  [ -s "$WF" ]
}

@test "gitlab-mirror-workflow: Trigger enthaelt push auf main" {
  if [ ! -f "$WF" ]; then
    echo "erwartete Datei fehlt: $WF" >&2
    false
  fi
  grep -qE '^\s*push:' "$WF"
  grep -qE '^\s*branches:\s*\[?\s*main' "$WF"
}

@test "gitlab-mirror-workflow: fuehrt einen Mirror-Push aus" {
  if [ ! -f "$WF" ]; then
    echo "erwartete Datei fehlt: $WF" >&2
    false
  fi
  grep -qF -- 'push' "$WF"
  grep -qe '--mirror' "$WF"
}

@test "gitlab-mirror-workflow: fetch-depth 0 statt flachem Klon" {
  if [ ! -f "$WF" ]; then
    echo "erwartete Datei fehlt: $WF" >&2
    false
  fi
  grep -qE 'fetch-depth:\s*0' "$WF"
}

@test "gitlab-mirror-workflow: beide Mirror-Secrets werden referenziert und ihr Fehlen abgefangen" {
  if [ ! -f "$WF" ]; then
    echo "erwartete Datei fehlt: $WF" >&2
    false
  fi

  # Positiv-Anker: beide Secretnamen kommen ueberhaupt vor.
  grep -qF -- 'GITLAB_MIRROR_TOKEN' "$WF"
  grep -qF -- 'GITLAB_MIRROR_URL' "$WF"

  # Es gibt einen Schritt, der bei fehlendem Secret abbricht statt still weiterzulaufen.
  grep -qe 'exit 1' "$WF"
}
