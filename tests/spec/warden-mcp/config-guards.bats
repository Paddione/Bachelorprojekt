#!/usr/bin/env bats
# tests/spec/warden-mcp/config-guards.bats
# SSOT-Spec: openspec/specs/warden-mcp.md (REQ-WARDEN-MCP-002, REQ-WARDEN-MCP-003)
#
# Der MCP-Server `warden` greift auf den persoenlichen Tresor des Nutzers zu
# (T900404). Diese Guards halten vier Zusagen fest: keine Credentials in
# getrackten Configs, genau zwei Harnesses (claude_code und opencode) — der
# llama.cpp-Pfad bleibt tresorfrei — und jedes mutierende Tool des gepinnten
# Release (0.2.44) verlangt in BEIDEN Harness-Configs eine Rueckfrage
# (permissions.ask bzw. permission).

setup() {
  command -v jq >/dev/null 2>&1 || skip "jq binary not installed"
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
}

# Liest einen Pfad aus der Registry — derselbe yaml-Parser wie scripts/mcp-sync.sh
# (yq ist in CI nicht installiert).
_registry() {
  (cd "$REPO_ROOT" && node -e "
    const c = require('yaml').parse(require('fs').readFileSync('docs/agent-guide/registry/mcp.yaml', 'utf8')).clients.warden || {};
    const v = { transport: c.transport, harnesses: Object.keys(c.harness || {}).join(',') }[process.argv[1]];
    process.stdout.write(String(v));
  " "$1")
}

# Quelle: dist/tools/registerTools.js von @icoretech/warden-mcp@0.2.44 — alle
# registerTool-Aufrufe mit mutatingToolAnnotations/destructiveToolAnnotations.
MUTATING_TOOLS=(
  create_attachment create_card create_folder create_identity create_login
  create_logins create_note create_org_collection create_ssh_key
  delete_attachment delete_folder delete_item delete_items delete_org_collection
  edit_folder edit_org_collection move_item_to_organization restore_item
  send_create send_create_encoded send_delete send_edit send_remove_password
  set_login_uris update_item
)

@test ".mcp.json starts warden only through the launcher, without credentials" {
  run jq -c '.mcpServers.warden' "${REPO_ROOT}/.mcp.json"
  [ "$status" -eq 0 ]
  [ "$output" = '{"command":"node","args":["scripts/warden-mcp/launch.mjs"]}' ]
  [[ "$output" != *'BW_'* ]]
  [[ "$output" != *'${'* ]]
}

@test "registry pins warden to stdio and the two approved harnesses" {
  (cd "$REPO_ROOT" && node -e "require('yaml')" 2>/dev/null) || skip "node module yaml not resolvable"
  run _registry transport
  [ "$status" -eq 0 ]
  [ "$output" = "stdio" ]
  run _registry harnesses
  [ "$status" -eq 0 ]
  [ "$output" = "claude_code,opencode" ]
  run grep -c "@icoretech/warden-mcp@0.2.44" "${REPO_ROOT}/scripts/warden-mcp/launch.mjs"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "opencode renders warden through the launcher, llama.cpp config stays without it" {
  local oc="${REPO_ROOT}/.opencode/opencode.jsonc"
  # Positiv-Anker: die Datei ist eine echte MCP-Config (context7 steht drin).
  run grep -c '"context7"' "$oc"
  [ "$output" -ge 1 ]
  # warden laeuft in opencode als lokaler stdio-Server ueber denselben Launcher.
  run grep -A6 '"warden": {' "$oc"
  [ "$status" -eq 0 ]
  echo "warden block: $output"
  [[ "$output" == *'"type": "local"'* ]]
  [[ "$output" == *'"command": ["node","scripts/warden-mcp/launch.mjs"]'* ]]
  [[ "$output" == *'"enabled": true'* ]]
  # Auch in der generierten Config landen keine Credentials.
  [[ "$output" != *'BW_'* ]]

  # Der llama.cpp-Pfad behaelt keinen Tresorpfad (Positiv-Anker: context7).
  local llm="${REPO_ROOT}/scripts/llm/mcp-servers.json"
  run grep -c '"context7"' "$llm"
  [ "$output" -ge 1 ]
  run grep -c '"warden"' "$llm"
  [ "$output" = "0" ]
}

@test "every mutating warden tool asks for confirmation in both harness configs" {
  local settings="${REPO_ROOT}/.claude/settings.json"
  local oc="${REPO_ROOT}/.opencode/opencode.jsonc"
  local found=0
  for t in "${MUTATING_TOOLS[@]}"; do
    run jq -e --arg n "mcp__warden__keychain_${t}" '.permissions.ask | index($n)' "$settings"
    [ "$status" -eq 0 ] || { echo "missing ask rule (claude_code): $t"; return 1; }
    # opencode bildet Tool-IDs ohne mcp__-Praefix: <server>_<tool> = warden_keychain_*.
    run grep -c "\"warden_keychain_${t}\": \"ask\"" "$oc"
    [ "$output" = "1" ] || { echo "missing ask rule (opencode): $t"; return 1; }
    found=$((found + 1))
  done
  # Positiv-Anker: die Schleife hat wirklich alle 25 geprueft.
  [ "$found" -eq 25 ]
  run jq -r '[.permissions.allow[] | select(startswith("mcp__warden") or . == "mcp__*")] | length' "$settings"
  [ "$status" -eq 0 ]
  [ "$output" = "0" ]
  # In opencode darf kein warden-Tool vorab erlaubt (oder verboten) sein.
  run grep -cE '"warden_keychain_[a-z_]+": "(allow|deny)"' "$oc"
  [ "$output" = "0" ]
}
