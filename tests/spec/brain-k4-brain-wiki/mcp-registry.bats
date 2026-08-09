#!/usr/bin/env bats
# tests/spec/brain-k4-brain-wiki/mcp-registry.bats
# Ticket: T002679
# SSOT-Spec: openspec/specs/brain-k4-brain-wiki.md
# Pruefmodus: Hybrid (dokumentierte Ausnahme der Output-Verifikations-Konvention
#   T002448-M4). Die Aussage "Registry ist Quelle, Konfigurationen sind generiert"
#   manifestiert sich in Dateiinhalten — deshalb ist hier neben dem Kommandolauf
#   auch Dateipruefung das angemessene Mittel. Begruendung siehe
#   `tasks.d/p4-tests.md` "Verbindliche Testkonventionen", Punkt 1.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
}

@test "task mcp:check reports no drift" {
  if ! command -v task &>/dev/null; then
    skip "task not available"
  fi

  run task mcp:check
  [ "$status" -eq 0 ]
}

@test "the brain server entry exists in the two harness configs" {
  local file_count=0

  # Check .mcp.json
  local mcpjson="$REPO_ROOT/.mcp.json"
  if [ -f "$mcpjson" ]; then
    file_count=$((file_count + 1))
    local found
    found="$(python3 -c "
import json, sys
with open('$mcpjson') as f:
    data = json.load(f)
servers = data.get('mcpServers', {})
for name in servers:
    if 'brain' in name.lower():
        print('found')
        sys.exit(0)
print('not_found')
" 2>/dev/null)"
    [ "$found" = "found" ] || {
      echo "brain server not found in .mcp.json" >&2
      false
    }
  fi

  # Check .opencode/opencode.jsonc
  local jcs="$REPO_ROOT/.opencode/opencode.jsonc"
  if [ -f "$jcs" ]; then
    file_count=$((file_count + 1))
    # Strip comments and check
    local found2
    found2="$(python3 -c "
import json, sys, re
with open('$jcs') as f:
    text = f.read()
# Strip // comments ONLY where they start a line (after optional whitespace).
# A bare r'//.*' also eats the '//' inside every URL — '"\$schema": "https://..."'
# on line 2 becomes an unterminated string and json.loads dies before it ever
# reaches the mcp block. That is how this check went red while the entry it
# looks for was present and correct.
text = re.sub(r'(?m)^[ \t]*//.*$', '', text)
text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
data = json.loads(text)
servers = data.get('mcp', {})
# opencode stores mcp servers as an object keyed by name
for name in servers:
    if 'brain' in name.lower():
        print('found')
        sys.exit(0)
print('not_found')
")"
    [ "$found2" = "found" ] || {
      echo "brain server not found in .opencode/opencode.jsonc" >&2
      false
    }
  fi

  # Positiv-Anker: exactly 2 files checked
  [ "$file_count" -eq 2 ] || {
    echo "Expected 2 config files, checked $file_count" >&2
    false
  }
}

@test "the brain server is absent from the llama.cpp child-process config" {
  local llmservers="$REPO_ROOT/scripts/llm/mcp-servers.json"

  # Positiv-Anker: file exists and is valid JSON with at least one server
  [ -f "$llmservers" ] || {
    echo "scripts/llm/mcp-servers.json does not exist" >&2
    false
  }

  local server_count
  server_count="$(python3 -c "
import json, sys
with open('$llmservers') as f:
    data = json.load(f)
mcp_servers = data.get('mcpServers', {})
print(len(mcp_servers))
" 2>/dev/null)"
  [ "$server_count" -gt 0 ] || {
    echo "mcp-servers.json has no server entries" >&2
    false
  }

  # Now verify no brain entry
  local brain_found
  brain_found="$(python3 -c "
import json, sys
with open('$llmservers') as f:
    data = json.load(f)
mcp_servers = data.get('mcpServers', {})
for name in mcp_servers:
    if 'brain' in name.lower():
        print('found')
        sys.exit(0)
print('not_found')
" 2>/dev/null)"
  [ "$brain_found" = "not_found" ] || {
    echo "brain server should be absent from scripts/llm/mcp-servers.json" >&2
    false
  }
}

@test "the registry declares the brain server with stdio transport" {
  local reg="$REPO_ROOT/docs/agent-guide/registry/mcp.yaml"

  [ -f "$reg" ]

  # Find the brain-mcp entry and check transport: stdio
  local transport
  transport="$(python3 -c "
import yaml, sys
with open('$reg') as f:
    data = yaml.safe_load(f)
clients = data.get('clients', {})
for name, cfg in clients.items():
    if 'brain' in name.lower():
        print(cfg.get('transport', 'NOT_FOUND'))
        sys.exit(0)
print('ENTRY_NOT_FOUND')
" 2>/dev/null || echo "YAML_PARSE_FAILED")"

  [ "$transport" = "stdio" ] || {
    echo "Expected transport=stdio for brain-mcp, got: $transport" >&2
    false
  }
}
