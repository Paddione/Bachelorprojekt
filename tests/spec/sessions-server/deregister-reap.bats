#!/usr/bin/env bats
# tests/spec/sessions-server/deregister-reap.bats
# SSOT: openspec/specs/sessions-server.md — Deregistration + Dead Process Reaping.
# Prüfmodus: command output verification (Exit-Codes + Registry-JSON-Zustand).
#
# Hinweis: Das Verhalten von reap bei ungetrackten PIDs (server_pid <= 0) ist
# Gegenstand von T016251 / change session-hub-reap-purge-fixes und hier bewusst
# NICHT festgeschrieben — dieser Test deckt nur den konsolidierten Bestand ab.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  HUB="bash ${REPO_ROOT}/scripts/session-hub.sh"
  TMP_DIR="$(mktemp -d)"
  export SESSION_HUB_REGISTRY="${TMP_DIR}/active-sessions.json"
  export SESSION_HUB_NO_TUNNEL=1
  printf '[]\n' > "$SESSION_HUB_REGISTRY"
}

teardown() { rm -rf "${TMP_DIR:-}"; }

@test "deregister entfernt den Eintrag und beendet den getrackten Server nicht hart" {
  $HUB register --name baz --port 18082 --type companion --title "Baz" >/dev/null
  run $HUB deregister --name baz
  [ "$status" -eq 0 ]
  [ "$(jq 'length' "$SESSION_HUB_REGISTRY")" -eq 0 ]
}

@test "reap entfernt Eintraege mit totem server_pid" {
  jq '[{slug: "dead", type: "form", title: "Dead", port: 1,
        public_url: "https://session-dead.sessions.mentolder.de",
        local_url: "http://localhost:1/", tunnel_pid: 0, server_pid: 999999,
        started_at: "2026-01-01T00:00:00Z"}]' <<< '[]' > "$SESSION_HUB_REGISTRY"
  run $HUB reap
  [ "$status" -eq 0 ]
  [ "$(jq 'length' "$SESSION_HUB_REGISTRY")" -eq 0 ]
  [[ "$output" == *"reaped 1 stale session(s); 0 active"* ]]
}

@test "reap behaelt Eintraege mit lebendem server_pid" {
  # Positiv-Anker zum Negativtest oben: der eigene, definitiv lebende Prozess.
  jq --argjson me "$$" '[{slug: "alive", type: "form", title: "Alive", port: 2,
        public_url: "https://session-alive.sessions.mentolder.de",
        local_url: "http://localhost:2/", tunnel_pid: 0, server_pid: $me,
        started_at: "2026-01-01T00:00:00Z"}]' <<< '[]' > "$SESSION_HUB_REGISTRY"
  run $HUB reap
  [ "$status" -eq 0 ]
  [ "$(jq -r '.[0].slug' "$SESSION_HUB_REGISTRY")" = "alive" ]
}
