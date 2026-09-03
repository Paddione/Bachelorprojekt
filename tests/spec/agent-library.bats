#!/usr/bin/env bats

@test "all behavior fragment files exist" {
  for f in \
    ".claude/lib/behaviors/never-push-main.md" \
    ".claude/lib/behaviors/inject-plan-context.md" \
    ".claude/lib/behaviors/tool-use-safety.md" \
    ".claude/lib/behaviors/commit-conventions.md"; do
    [ -f "$f" ] || { echo "MISSING: $f"; return 1; }
  done
}

@test "all prompt snippet files exist" {
  for f in \
    ".claude/lib/prompts/review-lens-format.md" \
    ".claude/lib/prompts/diff-analysis-context.md" \
    ".claude/lib/prompts/review-coordinator.md"; do
    [ -f "$f" ] || { echo "MISSING: $f"; return 1; }
  done
}

@test "README.md index exists and lists all fragments" {
  [ -f ".claude/lib/README.md" ]
  for entry in \
    "behaviors/never-push-main.md" \
    "behaviors/inject-plan-context.md" \
    "behaviors/tool-use-safety.md" \
    "behaviors/commit-conventions.md" \
    "prompts/review-lens-format.md" \
    "prompts/diff-analysis-context.md" \
    "prompts/review-coordinator.md"; do
    grep -q "$entry" ".claude/lib/README.md" || { echo "README missing entry: $entry"; return 1; }
  done
}

@test "all agents have a Library section" {
  agents_dir=".agents/agents"
  [ -d "$agents_dir" ] || agents_dir=".claude/agents"
  for agent in "$agents_dir"/bachelorprojekt-*.md; do
    grep -q "^## Library" "$agent" || { echo "MISSING Library section in: $agent"; return 1; }
  done
}

@test "all library paths referenced in agents actually exist" {
  agents_dir=".agents/agents"
  [ -d "$agents_dir" ] || agents_dir=".claude/agents"
  for agent in "$agents_dir"/bachelorprojekt-*.md; do
    while IFS= read -r line; do
      if [[ "$line" =~ ^-\ \.claude/lib/ ]]; then
        path="${line#- }"
        [ -f "$path" ] || { echo "DEAD LINK in $agent: $path"; return 1; }
      fi
    done < "$agent"
  done
}

# ── [T002221] tools: frontmatter must name tools that actually resolve ──────#
#
# bachelorprojekt-db/-infra/-security each declared invented tool names — single
# underscores (`mcp_postgres_query`) and wildcards (`mcp_kubernetes_*`, `ticket_mcp_*`)
# instead of the real `mcp__<server>__<tool>` form. Neither shape resolves, so the
# lists collapsed to the empty set and every dispatch died with
# "would be spawned with zero tools - refusing". Three of six domain agents were
# unusable — including the two carrying the `opus` tier for the riskiest domains —
# and nothing caught it, because a tools list is never validated at author time.

@test "T002221: no agent declares a wildcard tool name (wildcards are never expanded)" {
  local bad=""
  for agent in .claude/agents/*.md; do
    while IFS= read -r entry; do
      [[ "$entry" == *"*"* ]] && bad="${bad}${agent}: ${entry}"$'\n'
    done < <(python3 tests/spec/helpers/agent-tools.py "$agent")
  done
  [ -z "$bad" ] || { echo "wildcard tool names found:"; echo "$bad"; return 1; }
}

@test "T002221: every MCP tool name uses the mcp__<server>__<tool> form" {
  local bad=""
  for agent in .claude/agents/*.md; do
    while IFS= read -r entry; do
      # An entry that mentions mcp or a known MCP server must match the real shape.
      if [[ "$entry" == mcp_* || "$entry" == *_mcp_* ]]; then
        [[ "$entry" =~ ^mcp__[a-z0-9-]+__[a-z0-9_]+$ ]] || bad="${bad}${agent}: ${entry}"$'\n'
      fi
    done < <(python3 tests/spec/helpers/agent-tools.py "$agent")
  done
  [ -z "$bad" ] || { echo "malformed MCP tool names (expected mcp__<server>__<tool>):"; echo "$bad"; return 1; }
}

@test "T002221: every non-MCP tool name is a known built-in" {
  local known=" Agent Artifact Bash BashOutput Edit ExitPlanMode Glob Grep KillShell LS NotebookEdit NotebookRead Read Skill Task TodoWrite ToolSearch WebFetch WebSearch Write "
  local bad=""
  for agent in .claude/agents/*.md; do
    while IFS= read -r entry; do
      [[ "$entry" == mcp__* || "$entry" == mcp_* || "$entry" == *_mcp_* ]] && continue
      [[ "$known" == *" ${entry} "* ]] || bad="${bad}${agent}: ${entry}"$'\n'
    done < <(python3 tests/spec/helpers/agent-tools.py "$agent")
  done
  [ -z "$bad" ] || { echo "unknown built-in tool names:"; echo "$bad"; return 1; }
}

@test "T002221: bachelorprojekt-db/-infra/-security declare no tools key (they inherit all)" {
  # Regression pin for the three agents that were broken. Dropping the key is the
  # deliberate fix (see the comment in each file) — it also survives MCP renames,
  # which a hand-maintained list does not.
  for agent in bachelorprojekt-db bachelorprojekt-infra bachelorprojekt-security; do
    local n
    n=$(python3 tests/spec/helpers/agent-tools.py ".claude/agents/${agent}.md" | grep -c . || true)
    [ "$n" -eq 0 ] || { echo "$agent declares $n tools entries — expected none"; return 1; }
  done
}

@test "T002221: an agent that does declare tools resolves to a non-empty list" {
  # Whatever an agent declares, it must not resolve to zero tools — that is the
  # exact condition that makes a dispatch refuse to spawn.
  for agent in .claude/agents/*.md; do
    if grep -qE '^tools:( *$| *\[)' "$agent"; then
      local n
      n=$(python3 tests/spec/helpers/agent-tools.py "$agent" | grep -c . || true)
      [ "$n" -gt 0 ] || { echo "$agent has a tools key that resolves to zero entries"; return 1; }
    fi
  done
}
