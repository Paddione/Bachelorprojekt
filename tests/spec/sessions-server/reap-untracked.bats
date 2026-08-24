#!/usr/bin/env bats
# tests/spec/sessions-server/reap-untracked.bats
# SSOT: openspec/specs/sessions-server.md — Dead Process Reaping (untracked PIDs).
# T016251: register-Eintraege (server_pid=0) duerfen vom reap nicht geloescht
# werden. Prüfmodus: command output verification (Registry-JSON-Zustand).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  HUB="bash ${REPO_ROOT}/scripts/session-hub.sh"
  TMP_DIR="$(mktemp -d)"
  export SESSION_HUB_REGISTRY="${TMP_DIR}/active-sessions.json"
  export SESSION_HUB_NO_TUNNEL=1
  printf '[]\n' > "$SESSION_HUB_REGISTRY"
}

teardown() { rm -rf "${TMP_DIR:-}"; }

@test "reap behaelt per register angelegte Eintraege ohne getrackten Prozess" {
  run $HUB register --name foo --port 18080 --type companion --title "Foo"
  [ "$status" -eq 0 ]
  [ "$(jq -r '.[0].server_pid' "$SESSION_HUB_REGISTRY")" = "0" ]

  run $HUB reap
  [ "$status" -eq 0 ]
  [ "$(jq 'length' "$SESSION_HUB_REGISTRY")" -eq 1 ]
  [ "$(jq -r '.[0].slug' "$SESSION_HUB_REGISTRY")" = "foo" ]
}
