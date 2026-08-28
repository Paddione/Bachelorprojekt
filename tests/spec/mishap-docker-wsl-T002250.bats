#!/usr/bin/env bats
# tests/spec/mishap-docker-wsl-T002250.bats
# T002250 — Mishap-Bundle: environment/docker-wsl
#
# Prüfmodus [T002448-M4]: M1 ist Confirmation-of-Fix (WSL-spezifische Funktion
# fix_wsl_docker_creds() wurde entfernt, da WSL-Host decommissioned ist).
# M2 ist Source-Verifikation — die Ausnahme für CI-Konfiguration.

load 'test_helper'

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

@test "T002250-M1: setup.sh no longer has WSL credsStore fix (WSL decommissioned)" {
  # T016438: WSL-Exit. Der WSL-Host (10.0.0.26) ist decommissioned — die
  # WSL-spezifischen Fixes in setup.sh (fix_wsl_docker_creds, check_wsl_dns)
  # wurden entfernt. Der Test bestätigt die Entferung, nicht die Funktion.
  local script="$REPO/scripts/setup.sh"
  [ -f "$script" ]

  # Positiv-Anker (T002356-M1): die Datei existiert und ist lauffähig.
  run bash -n "$script"
  [ "$status" -eq 0 ]

  # Negativ: die WSL-Docker-Creds-Funktion existiert nicht mehr.
  local has_fix
  has_fix=$(grep -c 'fix_wsl_docker_creds' "$script" || true)
  [ "$has_fix" -eq 0 ]

  # Negativ: der WSL-DNS-Check existiert nicht mehr.
  local has_dns
  has_dns=$(grep -c 'check_wsl_dns' "$script" || true)
  [ "$has_dns" -eq 0 ]
}

@test "T002250-M2: renovate workflow has --dns 1.1.1.1" {
  local workflow="$REPO/.github/workflows/renovate.yml"
  [ -f "$workflow" ]
  # '-e' ist hier PFLICHT: das Pattern beginnt mit '--', ohne '-e' parst grep es
  # als Long-Option und bricht mit Exit 2 ab ("invalid option"). [T002511]
  run grep -q -E -e '--dns[[:space:]]+1\.1\.1\.1' "$workflow"
  [ "$status" -eq 0 ]
}

@test "T002250-M2: sandbox-run.sh gives the egress proxy --dns 1.1.1.1 in WSL, not the sandbox containers" {
  local script="$REPO/scripts/factory/sandbox-run.sh"
  [ -f "$script" ]
  # T003871: der WSL-DNS-Workaround ist in die Proxy-Sicherstellung
  # (ensure_egress_proxy) umgezogen — der Proxy haengt am Default-Bridge, wo
  # 1.1.1.1 erreichbar ist. Die Sandbox-Container (internales Netz) duerfen das
  # Flag NICHT mehr tragen, dort waere 1.1.1.1 unerreichbar.
  # '-e' ist PFLICHT: das Pattern beginnt mit '--', ohne '-e' parst grep es als
  # Long-Option und bricht mit Exit 2 ab. [T002511] [T003108]
  #
  # Positiv-Anker zuerst [T002356-M1]: der Workaround lebt weiter (ohne ihn
  # waere die Negativ-Aussage trivial — ein Fix, der den Workaround ganz
  # entfernt, wuerde gruen).
  local proxy_section
  proxy_section="$(awk '/^ensure_egress_proxy\(\)/,/^}/' "$script")"
  run grep -q -E -e '--dns[[:space:]]+1\.1\.1\.1' <<<"$proxy_section"
  [ "$status" -eq 0 ]
  # Negativ: im Sandbox-Container-Aufruf (run_docker) taucht das Flag nicht
  # mehr auf.
  local run_section
  run_section="$(awk '/^run_docker\(\)/,/^}/' "$script")"
  run grep -q -E -e '--dns[[:space:]]+1\.1\.1\.1' <<<"$run_section"
  [ "$status" -eq 1 ]
}
