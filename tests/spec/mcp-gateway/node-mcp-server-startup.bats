#!/usr/bin/env bats
# tests/spec/mcp-gateway/node-mcp-server-startup.bats
# SSOT: openspec/specs/mcp-gateway.md
#
# Pruefmodus: command output verification — die Server werden tatsaechlich als
# stdio-Prozess gestartet und ihre JSON-RPC-Antwort geprueft. Ein Source-Grep
# taugt hier nicht: beide hier abgesicherten Defekte (Zirkelimport-Deadlock in
# ticket-mcp-node, process.stdout.flush() in brain-mcp-node) waren im Quelltext
# unauffaellig und zeigten sich ausschliesslich zur Laufzeit.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  command -v node >/dev/null 2>&1 || skip "node nicht verfuegbar"
}

# Sendet die uebergebenen JSON-RPC-Frames an einen stdio-MCP-Server und gibt
# dessen stdout zurueck. Das nachgestellte sleep haelt stdin offen, bis der
# Server geantwortet hat — ohne das schliesst die Pipe vor der Antwort.
mcp_stdio() {
  local server="$1"; shift
  local frame
  {
    for frame in "$@"; do printf '%s\n' "$frame"; done
    sleep 3
  } | timeout 25 node "$server" 2>/dev/null
}

INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"bats","version":"1"}}}'
LIST='{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# ── ticket-mcp-node ────────────────────────────────────────────────────

@test "ticket-mcp-node antwortet auf initialize (kein Zirkelimport-Deadlock)" {
  run mcp_stdio "$REPO/scripts/ticket-mcp-node/server.mjs" "$INIT"
  echo "output: $output"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"id":1'* ]]
  [[ "$output" == *'"result"'* ]]
  [[ "$output" == *'ticket-mcp'* ]]
}

@test "ticket-mcp-node liefert eine nicht-leere tools/list" {
  run mcp_stdio "$REPO/scripts/ticket-mcp-node/server.mjs" "$INIT" "$LIST"
  echo "output: $output"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"id":2'* ]]
  [[ "$output" == *'"tools":[{'* ]]
}

@test "ticket-mcp-node startet auch ueber runner.mjs ohne Argumente" {
  run mcp_stdio "$REPO/scripts/ticket-mcp-node/runner.mjs" "$INIT"
  echo "output: $output"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"result"'* ]]
  [[ "$output" == *'ticket-mcp'* ]]
}

@test "ticket-mcp-node runner.mjs --version bleibt ein CLI-Pfad" {
  run timeout 25 node "$REPO/scripts/ticket-mcp-node/runner.mjs" --version
  echo "output: $output"
  [ "$status" -eq 0 ]
  [[ "$output" == *'ticket-mcp-node version='* ]]
}

# ── brain-mcp-node ─────────────────────────────────────────────────────

@test "brain-mcp-node ueberlebt mehr als ein JSON-RPC-Frame" {
  # Positiv-Anker zuerst: die zweite Antwort muss ankommen. Vor dem Fix warf
  # writeMsg() beim ersten Frame einen TypeError und der Server beendete sich,
  # sodass id:2 nie erschien.
  run mcp_stdio "$REPO/scripts/brain-mcp-node/server.mjs" "$INIT" "$LIST"
  echo "output: $output"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"id":1'* ]]
  [[ "$output" == *'"id":2'* ]]
  [[ "$output" == *'brain-mcp'* ]]
  # Kein Internal error in irgendeiner Antwort.
  errors="$(printf '%s' "$output" | grep -c 'Internal error' || true)"
  [ "$errors" -eq 0 ]
}

# ── findRepoRoot terminiert ────────────────────────────────────────────

@test "ticket-mcp-node startet auch ausserhalb eines Repos (findRepoRoot terminiert)" {
  # findRepoRoot() lief bis zum Fix endlos, wenn oberhalb des Skripts kein
  # Repo-Root liegt: dirname('C:\') bleibt konstant, die Schleife brach nur
  # bei '/' ab. Reproduziert durch eine Kopie ausserhalb jedes Repos.
  tmp="$BATS_TEST_TMPDIR/standalone"
  mkdir -p "$tmp"
  cp "$REPO/scripts/ticket-mcp-node/server.mjs" \
     "$REPO/scripts/ticket-mcp-node/runner.mjs" \
     "$REPO/scripts/ticket-mcp-node/package.json" "$tmp/"
  run mcp_stdio "$tmp/server.mjs" "$INIT"
  echo "output: $output"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"result"'* ]]
}
