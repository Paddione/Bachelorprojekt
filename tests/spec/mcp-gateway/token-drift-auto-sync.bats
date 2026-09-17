#!/usr/bin/env bats
# tests/spec/mcp-gateway/token-drift-auto-sync.bats
# SSOT: openspec/changes/mcp-token-auto-sync/specs/mcp-gateway.md (Delta-Spec, 6 Szenarien)
# Ticket: T900223
#
# Pruefmodus (T002448-M4): ERGEBNIS-orientiert. `token-drift-heal.sh` wird per
# `run` AUSgefuehrt; geprueft werden $status/$output plus Dateizustand
# (server.env-Inhalt, Modus 600, Hook-Marker) — kein Grep gegen den Skriptquelltext.
#
# Fixture-Konventionen (aus mcp-sync-drift-no-secret-leak.bats, client-env-check.bats):
# HOME-Isolation ins tmpdir (echte ~/.config/*/server.env werden nie angefasst),
# Live-Secrets via MCP_LIVE_SECRET_FILE-Fixture, Hooks (systemctl, mcp-sync render,
# agent-msg post, doctor) via Stubs im PATH-Stubdir $TMPD/bin plus
# MCP_*_SCRIPT-Env-Overrides (die Repo-Skripte werden per Pfad aufgerufen, nicht
# per PATH — die Stubs liegen trotzdem alle im selben Stubdir).
#
# Hinweis: Es gibt bewusst keinen Python-Fake-Server wie in client-env-check.bats —
# das Design vergleicht sha256-Fingerprints (live vs. server.env), es gibt keinen
# HTTP-Hop. Live-Werte kommen aus der Fixture-Datei (steht fuer das devmesh-Secret),
# Cluster-unreachable wird durch unlesbares Live-Secret simuliert (fail-closed SKIP).

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  HEAL="$REPO_ROOT/scripts/mcp-gateway/token-drift-heal.sh"
  TMPD="$(mktemp -d)"
  FAKEHOME="$TMPD/fakehome"
  HOOK_CALLS="$TMPD/calls"
  mkdir -p "$FAKEHOME/.config/bge-mcp" "$FAKEHOME/.config/mcp-postgres" \
    "$FAKEHOME/.config/factory-mcp-node" "$HOOK_CALLS" "$TMPD/bin"

  # --- systemctl-Stub (PATH): protokolliert Unit-Restarts als Marker-Files ---
  cat > "$TMPD/bin/systemctl" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$HOOK_CALLS/systemctl-args"
if [ "\$1 \$2" = "--user restart" ]; then
  touch "$HOOK_CALLS/restart-\$3"
fi
exit 0
EOF
  chmod +x "$TMPD/bin/systemctl"

  # --- mcp-sync-Stub: protokolliert render-Laeufe ---
  cat > "$TMPD/bin/mcp-sync-stub.sh" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$HOOK_CALLS/sync-args"
if [ "\$1" = "render" ]; then
  touch "$HOOK_CALLS/render"
fi
exit 0
EOF
  chmod +x "$TMPD/bin/mcp-sync-stub.sh"

  # --- agent-msg-Stub: protokolliert gepostete Nachrichten ---
  cat > "$TMPD/bin/agent-msg-stub.sh" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$HOOK_CALLS/agent-msg"
exit 0
EOF
  chmod +x "$TMPD/bin/agent-msg-stub.sh"

  # --- doctor-Stub: Bearer-Probe gilt als bestanden ---
  cat > "$TMPD/bin/doctor-stub.sh" <<EOF
#!/usr/bin/env bash
touch "$HOOK_CALLS/doctor"
exit 0
EOF
  chmod +x "$TMPD/bin/doctor-stub.sh"
}

teardown() {
  rm -rf "$TMPD"
}

# Gemeinsames run-Env: HOME-isoliert, Live-Fixture, Stub-Hooks.
heal_env() {
  env HOME="$FAKEHOME" \
    MCP_LIVE_SECRET_FILE="$TMPD/live.env" \
    MCP_SYNC_SCRIPT="$TMPD/bin/mcp-sync-stub.sh" \
    AGENT_MSG_SCRIPT="$TMPD/bin/agent-msg-stub.sh" \
    MCP_DOCTOR_SCRIPT="$TMPD/bin/doctor-stub.sh" \
    PATH="$TMPD/bin:$PATH" \
    "$@"
}

@test "T1a Match: identical fingerprints exit 0, report match, touch nothing" {
  local token="live-token-aaa-111"
  printf 'BGE_MCP_TOKEN=%s\n' "$token" > "$TMPD/live.env"
  printf 'BGE_MCP_TOKEN=%s\n' "$token" > "$FAKEHOME/.config/bge-mcp/server.env"
  local mtime_before
  mtime_before="$(stat -c %Y "$FAKEHOME/.config/bge-mcp/server.env")"

  run heal_env bash "$HEAL" check

  echo "output: $output"
  [ "$status" -eq 0 ]
  # Positiv-Anker zuerst (T002356-M1): match plus Key-Name muessen dastehen.
  [[ "$output" == *"match"* ]]
  [[ "$output" == *"BGE_MCP_TOKEN"* ]]
  # Kein Hook lief, Datei unveraendert.
  [ ! -f "$HOOK_CALLS/render" ]
  [ ! -f "$HOOK_CALLS/restart-bge-mcp" ]
  [ "$(stat -c %Y "$FAKEHOME/.config/bge-mcp/server.env")" = "$mtime_before" ]
  # Negativ: Token-Wert nie im Output.
  [[ "$output" != *"$token"* ]]
}

@test "T1b Drift: differing fingerprints exit non-zero, report drift with key name only" {
  local live="live-token-bbb-222"
  local stale="stale-token-ccc-333"
  printf 'BGE_MCP_TOKEN=%s\n' "$live" > "$TMPD/live.env"
  printf 'BGE_MCP_TOKEN=%s\n' "$stale" > "$FAKEHOME/.config/bge-mcp/server.env"

  run heal_env bash "$HEAL" check

  echo "output: $output"
  [ "$status" -ne 0 ]
  # Positiv-Anker zuerst: drift plus Key-Name muessen dastehen.
  [[ "$output" == *"drift"* ]]
  [[ "$output" == *"BGE_MCP_TOKEN"* ]]
  # Negativ: weder Live- noch server.env-Wert im Output.
  [[ "$output" != *"$live"* ]]
  [[ "$output" != *"$stale"* ]]
}

@test "T1c Cluster-unreachable: unreadable live secret reports skip, exits 0, heals nothing" {
  local stale="stale-token-ddd-444"
  printf 'BGE_MCP_TOKEN=%s\n' "$stale" > "$FAKEHOME/.config/bge-mcp/server.env"
  # Kein $TMPD/live.env angelegt: Live-Secret nicht lesbar (Cluster down).
  local sum_before
  sum_before="$(sha256sum "$FAKEHOME/.config/bge-mcp/server.env" | cut -d' ' -f1)"

  run heal_env bash "$HEAL" check

  echo "output: $output"
  [ "$status" -eq 0 ]
  # Positiv-Anker zuerst: skip muss dastehen.
  [[ "$output" == *"skip"* ]]
  # Kein Hook lief, server.env unveraendert, kein Token-Wert im Output.
  [ ! -f "$HOOK_CALLS/render" ]
  [ ! -f "$HOOK_CALLS/restart-bge-mcp" ]
  [ "$(sha256sum "$FAKEHOME/.config/bge-mcp/server.env" | cut -d' ' -f1)" = "$sum_before" ]
  [[ "$output" != *"$stale"* ]]
}

@test "T2a Drift triggers full heal: server.env rewritten mode 600, render+unit hooks ran, others did not" {
  local newval="live-token-eee-555"
  local oldval="stale-token-fff-666"
  printf 'BGE_MCP_TOKEN=%s\n' "$newval" > "$TMPD/live.env"
  printf '# keep-me=yes\nBGE_MCP_TOKEN=%s\nOTHER=untouched\n' "$oldval" > "$FAKEHOME/.config/bge-mcp/server.env"

  run heal_env bash "$HEAL" heal

  echo "output: $output"
  [ "$status" -eq 0 ]
  # Positiv-Anker: Key-Name im Output (Heal-ERGEBNIS, kein Source-Grep).
  [[ "$output" == *"BGE_MCP_TOKEN"* ]]
  # server.env traegt den neuen Wert (Datei lesen ist hier zulaessig),
  # uebrige Zeilen erhalten, Modus 600.
  grep -qF "$newval" "$FAKEHOME/.config/bge-mcp/server.env"
  grep -qF "OTHER=untouched" "$FAKEHOME/.config/bge-mcp/server.env"
  [ "$(stat -c %a "$FAKEHOME/.config/bge-mcp/server.env")" = 600 ]
  # Render-Hook und betroffene Unit liefen, unbetroffene nicht.
  [ -f "$HOOK_CALLS/render" ]
  [ -f "$HOOK_CALLS/restart-bge-mcp" ]
  [ ! -f "$HOOK_CALLS/restart-mcp-postgres-local" ]
  [ ! -f "$HOOK_CALLS/restart-factory-mcp" ]
  # Negativ: kein Token-Wert (alt wie neu) im Output.
  [[ "$output" != *"$newval"* ]]
  [[ "$output" != *"$oldval"* ]]
}

@test "T2b No drift: heal is a total no-op" {
  local token="live-token-ggg-777"
  printf 'BGE_MCP_TOKEN=%s\n' "$token" > "$TMPD/live.env"
  printf 'BGE_MCP_TOKEN=%s\n' "$token" > "$FAKEHOME/.config/bge-mcp/server.env"
  local sum_before
  sum_before="$(sha256sum "$FAKEHOME/.config/bge-mcp/server.env" | cut -d' ' -f1)"

  run heal_env bash "$HEAL" heal

  echo "output: $output"
  [ "$status" -eq 0 ]
  # Positiv-Anker: match bestaetigt, dass der No-op-Pfad gemessen wurde.
  [[ "$output" == *"match"* ]]
  # Kein Hook lief, Datei bitidentisch.
  [ ! -f "$HOOK_CALLS/render" ]
  [ ! -f "$HOOK_CALLS/restart-bge-mcp" ]
  [ "$(sha256sum "$FAKEHOME/.config/bge-mcp/server.env" | cut -d' ' -f1)" = "$sum_before" ]
  [[ "$output" != *"$token"* ]]
}

@test "T2c Heal notifies about the required harness restart" {
  local newval="live-token-hhh-888"
  printf 'BGE_MCP_TOKEN=%s\n' "$newval" > "$TMPD/live.env"
  printf 'BGE_MCP_TOKEN=%s\n' "stale-token-iii-999" > "$FAKEHOME/.config/bge-mcp/server.env"

  run heal_env bash "$HEAL" heal

  echo "output: $output"
  [ "$status" -eq 0 ]
  # Positiv-Anker: agent-msg-Marker enthaelt Key-Namen UND Restart-Hinweis.
  [ -f "$HOOK_CALLS/agent-msg" ]
  grep -qF "BGE_MCP_TOKEN" "$HOOK_CALLS/agent-msg"
  grep -qiF "Harness" "$HOOK_CALLS/agent-msg"
  grep -qiF "start" "$HOOK_CALLS/agent-msg"
  # Negativ: kein Token-Wert in der Notification.
  local note
  note="$(cat "$HOOK_CALLS/agent-msg")"
  [[ "$note" != *"$newval"* ]]
  [[ "$output" != *"$newval"* ]]
}
