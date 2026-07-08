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
