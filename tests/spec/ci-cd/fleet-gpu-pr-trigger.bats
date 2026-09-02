#!/usr/bin/env bats
# tests/spec/ci-cd/fleet-gpu-pr-trigger.bats
# SSOT: openspec/specs/ci-cd.md
#
# T900040 — Workflows auf dem self-hosted Pool `fleet-gpu` duerfen nicht bei
# jedem Pull Request automatisch starten. Ist kein Runner mit dem Label online,
# greift kein continue-on-error: der Run bleibt unbegrenzt in `queued`.
# Beobachtet am 2026-09-02: der einzige fleet-gpu-Runner (`wsl-gpu-host`) ist
# seit dem WSL-Exit (T016422) dauerhaft offline, 22 "Merge Arbitration"-Runs
# hingen gleichzeitig in der Warteschlange.
#
# Dieselbe Lehre steht bereits im Kopfkommentar von arbitration.yml fuer den
# schedule-Trigger (T002927) — der pull_request-Trigger blieb damals stehen,
# weil der Runner nur zeitweise offline war, nicht dauerhaft entfallen.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) REPO="$(cygpath -m "$REPO")" ;; esac
}

# Liefert den on:-Block einer Workflow-Datei (bis zur naechsten Top-Level-Zeile).
on_block() {
  awk '/^on:/{f=1;next} f&&/^[a-zA-Z]/{exit} f{print}' "$1"
}

@test "arbitration.yml startet nicht automatisch bei jedem Pull Request" {
  run on_block "$REPO/.github/workflows/arbitration.yml"

  [[ "$output" != *"pull_request"* ]]
}

@test "arbitration.yml bleibt per workflow_dispatch ausloesbar" {
  run on_block "$REPO/.github/workflows/arbitration.yml"

  [[ "$output" == *"workflow_dispatch"* ]]
}
