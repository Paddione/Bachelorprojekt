#!/usr/bin/env bats
# tests/spec/agentic-tooling-quality-goals.bats
# SSOT: openspec/specs/agentic-tooling-quality-goals.md
#
# Covers: G-AGENTIC01–05: agent frontmatter, routing table, library reachability.
# Covers: G-AGENTIC09: SKILL.md > 500 lines (T002094).

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

# ── G-AGENTIC09: God-Skill line budget ────────────────────────────────
#
# Seit T002303 ein fail-closed Gate mit Schwelle 250 über die projekteigenen Skills
# (vorher: advisory target, Schwelle 500, alle Skills inkl. upstream-gepflegter).

@test "G-AGENTIC09: zero project-owned SKILL.md files exceed the declared limit" {
  local count
  count=$(cd "$REPO" && bash -c '
    source <(sed -n "/^project_owned_skills()/,/^}/p" scripts/health-goals-check.sh)
    c=0; for d in $(project_owned_skills); do
      [ "$(wc -l < ".claude/skills/$d/SKILL.md")" -gt 400 ] && c=$((c+1)); done; echo $c')
  [ "$count" -eq 0 ]
}

@test "G-AGENTIC09 is declared as a fail-closed gate, not an advisory target" {
  # Ein auf 'target' zurückgestuftes Gate meldet weiterhin 0 und bliebe sonst unbemerkt.
  run grep -E '^row gate G-AGENTIC09 ' "$REPO/scripts/health-goals-check.sh"
  [ "$status" -eq 0 ]
}

@test "G-AGENTIC09 measures 400 lines, not the legacy 500" {
  # [T002452] Schwelle 250 -> 400: dev-flow-plan/SKILL.md stand exakt auf 250 und
  # dev-flow-execute auf 247 — das Gate blockierte damit nicht mehr Wachstum, sondern
  # jede inhaltliche Aenderung an diesen Dateien. 400 laesst Reserve und bleibt klar
  # unter der Alt-Schwelle 500, die T002303 aus gutem Grund verworfen hat: 500 lag
  # weit ueber der Progressive-Disclosure-Grenze, die das Gate schuetzen soll.
  # Dieser Test haelt die Untergrenze offen und die Obergrenze zu.
  run grep -A3 '^row gate G-AGENTIC09 ' "$REPO/scripts/health-goals-check.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"-gt 400"* ]]
  # Rueckfall auf die Alt-Schwelle bleibt verboten.
  [[ "$output" != *"-gt 500"* ]]
}

@test "project_owned_skills derives the vendor set from the OVERVIEW.md marker block" {
  run grep -A3 '^project_owned_skills()' "$REPO/scripts/health-goals-check.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"vendor-skills:begin"* ]]
}
