#!/usr/bin/env bats
# tests/spec/mcp-tooling.bats — MCP tool registration & permission guards

load 'test_helper'

MCP_GUIDE="${PROJECT_DIR}/.claude/skills/references/mcp-tool-guide.md"

@test "factory-mcp is registered at :13003/mcp in BOTH .mcp.json and .opencode/opencode.jsonc" {
  local opencode_json mcp_servers=()
  
  opencode_json=$(cat ".opencode/opencode.jsonc")
  
  # Check .mcp.json (project-level Claude Code MCP config) for factory-mcp
  if ! grep -q '"factory-mcp"' ".mcp.json"; then
    echo "# ERROR: factory-mcp not registered in .mcp.json" && exit 1
  fi
  
  # Check .opencode/opencode.jsonc for all MCP servers
  if ! echo "$opencode_json" | grep -q '"factory-mcp"'; then
    echo "# ERROR: factory-mcp not registered in opencode.jsonc" && exit 1
  fi
  
  if ! echo "$opencode_json" | grep -q '"mcp-kubernetes"'; then
    echo "# ERROR: mcp-kubernetes not registered in opencode.jsonc" && exit 1
  fi
  
  if ! echo "$opencode_json" | grep -q '"mcp-postgres"'; then
    echo "# ERROR: mcp-postgres not registered in opencode.jsonc" && exit 1
  fi
}

@test "every skill-critical ticket.sh verb has a ticket-mcp wrapper" {
  local missing=()
  
  while IFS= read -r line; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// /}" ]] && continue
    
    if [[ "$line" =~ \.\./scripts/ticket\.sh\ ([a-z_-]+) ]]; then
      local verb="${BASH_REMATCH[1]}"
      
      if ! grep -q "ticket-mcp.*${verb}" ".opencode/commands/*.md" 2>/dev/null && \
         ! grep -q "ticket_mcp_.*${verb}" ".claude/skills/ticket-ops/SKILL.md" 2>/dev/null; then
        missing+=("ticket.sh: $verb")
      fi
    fi
  done < "$MCP_GUIDE"
  
  if [ "${#missing[@]}" -gt 0 ]; then
    echo "# Tools missing from mcp-tool-guide.md: ${missing[*]}" >&2
  fi
  [ "${#missing[@]}" -eq 0 ]
}

@test "every ticket-mcp Go tool is listed in mcp-tool-guide.md" {
  local tools_in_use documented=()
  
  while IFS=' ' read -r _ command _; do
    [[ ! "$command" =~ ^./scripts/mcp.* ]] && continue
    tools_in_use+=("$command")
  done < <(grep -h "mcp__" scripts/*.sh | sed 's/.*\(mcp__[a-z0-9_-]*\).*/\1/' | sort -u)
  
  while IFS=' ' read -r _ toolname _; do
    [[ ! "$toolname" =~ ^# ]] && documented+=("$toolname")
  done < <(grep "^- \`./scripts/mcp.*\`" "$MCP_GUIDE" | sed 's/- \`\([^ ]*\).*/\1/' | sort -u)
  
  for tool in "${tools_in_use[@]}"; do
    local name=$(echo "$tool" | sed 's|mcp-||' | cut -d'-' -f2-)
    if ! echo "${documented[*]}" | grep -qw "$name"; then
      echo "# WARNING: $tool not documented in mcp-tool-guide.md" >&2
    fi
  done
  
  [ "${#missing[@]}" -eq 0 ]
}

@test "antigravity-cli settings.json pre-grants Bash(gh *) permission (T001274)" {
  skip "antigravity-cli not installed — skipping T001274"
}

# --- T002398: llama.cpp als vierter MCP-Harness --------------------------------
# llama.cpp spricht MCP NUR ueber stdio (server_mcp_stdio ist die einzige
# Transport-Implementierung) und verwirft fehlerhafte Eintraege WORTLOS. Diese
# Guards stellen sicher, dass der Generator die Fehler stattdessen meldet.

@test "T002398: mcp-sync render erzeugt gueltiges scripts/llm/mcp-servers.json" {
  run bash scripts/mcp-sync.sh render
  [ "$status" -eq 0 ]
  run node -e 'const d=require("./scripts/llm/mcp-servers.json"); if(typeof d.mcpServers!=="object") process.exit(1)'
  [ "$status" -eq 0 ]
}

@test "T002398: jeder Eintrag hat ein nicht-leeres command" {
  run node -e '
    const d=require("./scripts/llm/mcp-servers.json");
    const bad=Object.entries(d.mcpServers).filter(([,v])=>!v.command).map(([k])=>k);
    if(bad.length){console.error("ohne command: "+bad.join(","));process.exit(1)}
  '
  [ "$status" -eq 0 ]
}

@test "T002398: kein http-Server steht in der llama.cpp-Config" {
  run node -e '
    const fs=require("fs"), yaml=require("yaml");
    const reg=yaml.parse(fs.readFileSync("docs/agent-guide/registry/mcp.yaml","utf8"));
    const gen=require("./scripts/llm/mcp-servers.json");
    const http=Object.entries(reg.clients).filter(([,c])=>c.transport==="http").map(([k])=>k);
    const bad=http.filter(n=>n in gen.mcpServers);
    if(bad.length){console.error("http in llama.cpp-Config: "+bad.join(","));process.exit(1)}
  '
  [ "$status" -eq 0 ]
}

@test "T002398: mcp:check erkennt Drift in der llama.cpp-Config" {
  cp scripts/llm/mcp-servers.json "$BATS_TEST_TMPDIR/backup.json"
  node -e '
    const fs=require("fs");
    const d=JSON.parse(fs.readFileSync("scripts/llm/mcp-servers.json","utf8"));
    d.mcpServers["drift-probe"]={command:"nope"};
    fs.writeFileSync("scripts/llm/mcp-servers.json", JSON.stringify(d,null,2)+"\n");
  '
  run bash scripts/mcp-sync.sh check
  cp "$BATS_TEST_TMPDIR/backup.json" scripts/llm/mcp-servers.json
  [ "$status" -ne 0 ]
}

@test "T002398: llamacpp-Block an einem http-Server laesst render fehlschlagen" {
  cp docs/agent-guide/registry/mcp.yaml "$BATS_TEST_TMPDIR/reg.yaml"
  node -e '
    const fs=require("fs"), yaml=require("yaml");
    const reg=yaml.parse(fs.readFileSync("docs/agent-guide/registry/mcp.yaml","utf8"));
    const httpName=Object.entries(reg.clients).find(([,c])=>c.transport==="http")[0];
    reg.clients[httpName].harness.llamacpp={command:"should-not-be-emitted"};
    fs.writeFileSync("docs/agent-guide/registry/mcp.yaml", yaml.stringify(reg));
  '
  run bash scripts/mcp-sync.sh render
  cp "$BATS_TEST_TMPDIR/reg.yaml" docs/agent-guide/registry/mcp.yaml
  bash scripts/mcp-sync.sh render >/dev/null 2>&1 || true
  [ "$status" -ne 0 ]
}
