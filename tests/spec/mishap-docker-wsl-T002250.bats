#!/usr/bin/env bats
# tests/spec/mishap-docker-wsl-T002250.bats
# T002250 — Mishap-Bundle: environment/docker-wsl
#
# Prüfmodus [T002448-M4]: M1 ist Resultat-Verifikation (setup.sh wird ausgeführt,
# geprüft wird die geschriebene config.json). M2 ist Source-Verifikation — die
# Ausnahme für CI-Konfiguration: dass ein Workflow bzw. ein docker-run-Aufruf ein
# bestimmtes Flag trägt, manifestiert sich ausschliesslich im Quelltext.

load 'test_helper'

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

@test "T002250-M1: setup.sh removes credsStore in WSL" {
  local mock_home
  mock_home=$(mktemp -d)
  mkdir -p "$mock_home/.docker"
  
  # Create a mock config.json containing credsStore
  echo '{"auths":{"ghcr.io":{}},"credsStore":"desktop.exe"}' > "$mock_home/.docker/config.json"
  
  # Run setup.sh with mock HOME and WSL env.
  # Der Exitcode wird BEWUSST nicht assertet: setup.sh --check bündelt in ihm die
  # Prerequisite-Prüfung (kubectl/docker/k3d/kustomize/yq + laufender Docker-Daemon)
  # und liefert auf einem CI-Runner zwangsläufig 1 — mit dem credsStore-Fix hat das
  # nichts zu tun. Geprüft wird deshalb die Wirkung, nicht der Sammel-Exitcode.
  # [T002511]
  HOME="$mock_home" WSL_DISTRO_NAME="test-wsl" run bash "$REPO/scripts/setup.sh" --check

  # Verify config.json exists and credsStore is removed
  [ -f "$mock_home/.docker/config.json" ]
  local creds
  creds=$(jq -r '.credsStore // empty' "$mock_home/.docker/config.json")
  [ -z "$creds" ]
  # Positiv-Anker [T002356-M1]: die Datei wurde umgeschrieben, nicht geleert oder
  # zerstört. Ohne ihn wäre "credsStore ist leer" auch bei kaputtem JSON grün.
  local auths
  auths=$(jq -r '.auths | keys[]' "$mock_home/.docker/config.json")
  [ "$auths" = "ghcr.io" ]

  rm -rf "$mock_home"
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
