#!/usr/bin/env bats
# tests/spec/agentic-tooling-quality-goals.bats
# SSOT: openspec/specs/agentic-tooling-quality-goals.md
#
# Covers: G-AGENTIC01–05: agent frontmatter, routing table, library reachability.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

# ── G-AGENTIC03: Frontmatter completeness ─────────────────────────────

@test "G-AGENTIC03: every .claude/agents/*.md has a name: field in frontmatter" {
  local missing=0
  for f in "$REPO"/.claude/agents/bachelorprojekt-*.md; do
    run grep -q '^name:' "$f"
    if [ "$status" -ne 0 ]; then
      echo "MISSING name: in $f" >&2
      missing=1
    fi
  done
  [ "$missing" -eq 0 ]
}

@test "G-AGENTIC03: every .claude/agents/*.md has a description: field in frontmatter" {
  local missing=0
  for f in "$REPO"/.claude/agents/bachelorprojekt-*.md; do
    run grep -q '^description:' "$f"
    if [ "$status" -ne 0 ]; then
      echo "MISSING description: in $f" >&2
      missing=1
    fi
  done
  [ "$missing" -eq 0 ]
}

@test "G-AGENTIC03: agent name: matches filename basename" {
  local bad=0
  for f in "$REPO"/.claude/agents/bachelorprojekt-*.md; do
    local base
    base=$(basename "$f" .md)
    local name_val
    name_val=$(grep '^name:' "$f" | head -1 | sed 's/^name:[[:space:]]*//')
    if [ "$name_val" != "$base" ]; then
      echo "MISMATCH: $f has name=$name_val, expected $base" >&2
      bad=1
    fi
  done
  [ "$bad" -eq 0 ]
}

# ── G-AGENTIC02: Routing table drift ──────────────────────────────────

@test "G-AGENTIC02: AGENTS.md routing table mentions all 6 agents" {
  for agent in bachelorprojekt-ops bachelorprojekt-infra bachelorprojekt-db bachelorprojekt-security bachelorprojekt-test bachelorprojekt-website; do
    run grep -q "$agent" "$REPO/AGENTS.md"
    if [ "$status" -ne 0 ]; then
      echo "AGENTS.md missing routing entry for $agent" >&2
      return 1
    fi
  done
}

# ── G-AGENTIC04: test:changed triggers agent-library ──────────────────

@test "G-AGENTIC04: test:changed bucket for .claude/agents/ includes agent-library.bats" {
  run grep -q 'agent-library' "$REPO/Taskfile.yml"
  [ "$status" -eq 0 ]
}

# ── G-AGENTIC05: six-agent cross-reference ────────────────────────────

@test "G-AGENTIC05: exactly 6 agent files exist under .claude/agents/" {
  local count
  count=$(find "$REPO/.claude/agents" -name 'bachelorprojekt-*.md' 2>/dev/null | wc -l)
  [ "$count" -eq 6 ]
}
