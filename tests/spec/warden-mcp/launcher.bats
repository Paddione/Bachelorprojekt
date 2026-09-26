#!/usr/bin/env bats
# tests/spec/warden-mcp/launcher.bats
# SSOT-Spec: openspec/specs/warden-mcp.md (REQ-WARDEN-MCP-001)
#
# Der Launcher darf warden-mcp nur mit vollstaendigen Credentials aus
# ~/.config/warden-mcp/server.env starten und gibt nie einen Secret-Wert aus
# (T900404). WARDEN_MCP_DRY_RUN=1 beendet ihn vor dem Spawn.

setup() {
  # T002820: Verfuegbarkeits-Guard — ohne node misst der Test die Runner-Ausstattung.
  command -v node >/dev/null 2>&1 || skip "node binary not installed"
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  LAUNCHER="${REPO_ROOT}/scripts/warden-mcp/launch.mjs"
  export HOME="${BATS_TEST_TMPDIR}/home"
  export USERPROFILE="$HOME"
  CONF_DIR="${HOME}/.config/warden-mcp"
  mkdir -p "$HOME"
  unset BW_HOST BW_CLIENTID BW_CLIENTSECRET BW_PASSWORD BW_BIN
}

_write_env() {
  mkdir -p "$CONF_DIR"
  printf '%s\n' "$@" > "${CONF_DIR}/server.env"
  chmod 600 "${CONF_DIR}/server.env"
}

@test "launcher refuses to start without server.env and names the expected path" {
  run node "$LAUNCHER"
  [ "$status" -ne 0 ]
  [[ "$output" == *".config/warden-mcp/server.env"* ]]
}

@test "launcher refuses to start when BW_PASSWORD is empty and names the key" {
  _write_env "BW_HOST=https://vault.example.test" "BW_CLIENTID=user.dummy" \
    "BW_CLIENTSECRET=dummy-secret-value" "BW_PASSWORD="
  run node "$LAUNCHER"
  [ "$status" -ne 0 ]
  [[ "$output" == *"BW_PASSWORD"* ]]
  [[ "$output" != *"dummy-secret-value"* ]]
}

@test "dry run resolves the pinned package without leaking secret values" {
  _write_env "BW_HOST=https://vault.example.test" "BW_CLIENTID=user.dummy" \
    "BW_CLIENTSECRET=dummy-secret-value" "BW_PASSWORD='dummy-master-value'" \
    "BW_BIN=/usr/bin/true"
  WARDEN_MCP_DRY_RUN=1 run node "$LAUNCHER"
  [ "$status" -eq 0 ]
  [[ "$output" == *"@icoretech/warden-mcp@0.2.44"* ]]
  [[ "$output" == *"--stdio"* ]]
  [[ "$output" == *"bw-profiles"* ]]
  [[ "$output" != *"dummy-secret-value"* ]]
  [[ "$output" != *"dummy-master-value"* ]]
}
