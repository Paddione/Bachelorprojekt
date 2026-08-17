#!/usr/bin/env bats
# tests/spec/ci-cd/gitlab-runner-setup-dryrun.bats — Verhalten des Setup-Skripts [T011790]
#
# PRUEFMODUS: Output-Verifikation (Konvention T002448-M4). Dieser Guard fuehrt
# scripts/gitlab-runner-setup.sh tatsaechlich aus und prueft $status/$output — nicht
# den Quelltext des Skripts. Der --dry-run-Modus existiert genau dafuer (design.md D5):
# er macht das Skript pruefbar, ohne GitLab zu kontaktieren oder gitlab-runner zu
# installieren.
#
# Achtung ($output-Matching): Niemals unqualifiziert gegen die volle Ausgabe pruefen,
# wenn das Skript $0 in seinem Usage-Text ausgibt — der Worktree-Verzeichnisname
# (hier "gitlab-ci-migration-stage1") kann sonst einen Treffer erzeugen, obwohl das
# gepruefte Merkmal fehlt. Die Assertions unten grenzen deshalb auf die relevanten
# Ausgabezeilen/-substrings ein und pruefen keinen Text, der aus einem Usage-Block
# stammen koennte.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SETUP_SH="${REPO_ROOT}/scripts/gitlab-runner-setup.sh"
}

@test "gitlab-runner-setup-dryrun: --dry-run gibt den Registrierungsbefehl aus, Exit 0, ohne Token" {
  if [ ! -f "$SETUP_SH" ]; then
    echo "erwartete Datei fehlt: $SETUP_SH" >&2
    false
  fi

  unset GITLAB_RUNNER_TOKEN
  run bash "$SETUP_SH" --dry-run
  [ "$status" -eq 0 ]

  # Positiv-Anker [T002356-M1]: --token muss in der Ausgabe stehen, sonst ist die
  # anschliessende Negativ-Aussage (kein --registration-token) vakuos — eine leere
  # Ausgabe enthaelt "--registration-token" ebenfalls nicht.
  echo "$output" | grep -qe '--token'
  echo "$output" | grep -qF -- 'gitlab-runner register'

  # Negativ-Aussage, jetzt mit belegtem Positiv-Anker:
  ! echo "$output" | grep -qe '--registration-token'

  echo "$output" | grep -qF -- 'bachelorprojekt-local'
  echo "$output" | grep -qe '--run-untagged=false'
}

@test "gitlab-runner-setup-dryrun: Echtlauf ohne Token bricht ab und benennt die Variable" {
  if [ ! -f "$SETUP_SH" ]; then
    echo "erwartete Datei fehlt: $SETUP_SH" >&2
    false
  fi

  unset GITLAB_RUNNER_TOKEN
  run bash "$SETUP_SH"
  [ "$status" -ne 0 ]
  echo "$output" | grep -qF -- 'GITLAB_RUNNER_TOKEN'
}
