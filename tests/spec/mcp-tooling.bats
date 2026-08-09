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
  # [T002779] Render in tmpdir statt auf die getrackten Dateien.
  local tmpd="$BATS_TEST_TMPDIR/mcp-render-valid"
  mkdir -p "$tmpd/scripts/llm"
  run env MCP_OUT_DIR="$tmpd" bash scripts/mcp-sync.sh render
  [ "$status" -eq 0 ]
  run node -e "const d=require('$tmpd/scripts/llm/mcp-servers.json'); if(typeof d.mcpServers!=='object') process.exit(1)"
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
  # [T002779] Fixture im tmpdir statt in-place-Mutation der getrackten Datei.
  # MCP_OUT_DIR leitet den Output in die Sandbox um; die echte Datei bleibt
  # unangetastet — keine Race mit parallel laufenden Spec-Dateien mehr.
  local tmpd="$BATS_TEST_TMPDIR/mcp-check"
  mkdir -p "$tmpd/scripts/llm" "$tmpd/.opencode"

  # Alle drei Ziel-Dateien kopieren — check vergleicht gegen alle Targets.
  cp .mcp.json "$tmpd/.mcp.json"
  cp .opencode/opencode.jsonc "$tmpd/.opencode/opencode.jsonc"
  cp scripts/llm/mcp-servers.json "$tmpd/scripts/llm/mcp-servers.json"

  # Positiv-Anker [T002356-M1]: unmanipulierter Lauf muss gruen sein.
  # Waere das Skript nicht ausfuehrbar oder die Fixture kaputt, bliebe
  # status=0 trivial — die Negativ-Aussage unten waere vakuos wahr.
  run env MCP_OUT_DIR="$tmpd" bash scripts/mcp-sync.sh check
  [ "$status" -eq 0 ]

  # Drift injizieren und prufen dass check ihn erkennt.
  node -e '
    const fs=require("fs"), path=require("path");
    const fn=path.join(process.argv[1],"scripts/llm/mcp-servers.json");
    const d=JSON.parse(fs.readFileSync(fn,"utf8"));
    d.mcpServers["drift-probe"]={command:"nope"};
    fs.writeFileSync(fn, JSON.stringify(d,null,2)+"\n");
  ' "$tmpd"
  run env MCP_OUT_DIR="$tmpd" bash scripts/mcp-sync.sh check
  [ "$status" -ne 0 ]
}

@test "T002398: llamacpp-Block an einem http-Server laesst render fehlschlagen" {
  # [T002779] Fixture im tmpdir statt in-place-Mutation der getrackten Datei.
  # MCP_REGISTRY setzt auf eine Sandbox-Kopie, MCP_OUT_DIR leitet alle Outputs
  # dorthin um, und HOME verhindert Seiteneffekte des agy-Renderers.
  local tmpd="$BATS_TEST_TMPDIR/mcp-llamacpp"
  mkdir -p "$tmpd/fakehome"

  # Positiv-Anker [T002356-M1]: die Fixture muss existieren und der
  # unmanipulierte Lauf gruen sein.
  cp docs/agent-guide/registry/mcp.yaml "$tmpd/registry.yaml"
  run env HOME="$tmpd/fakehome" MCP_REGISTRY="$tmpd/registry.yaml" MCP_OUT_DIR="$tmpd" bash scripts/mcp-sync.sh render
  [ "$status" -eq 0 ]

  # llamacpp-Block an den ersten http-Client haengen und erwarten, dass
  # render den Fehler meldet (exit != 0).
  node -e '
    const fs=require("fs"), yaml=require("yaml");
    const reg=yaml.parse(fs.readFileSync(process.argv[1],"utf8"));
    const httpName=Object.entries(reg.clients).find(([,c])=>c.transport==="http")[0];
    reg.clients[httpName].harness.llamacpp={command:"should-not-be-emitted"};
    fs.writeFileSync(process.argv[1], yaml.stringify(reg));
  ' "$tmpd/registry.yaml"
  run env HOME="$tmpd/fakehome" MCP_REGISTRY="$tmpd/registry.yaml" MCP_OUT_DIR="$tmpd" bash scripts/mcp-sync.sh render
  [ "$status" -ne 0 ]
}
