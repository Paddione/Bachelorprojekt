#!/usr/bin/env bats
# tests/spec/openspec-workflow.bats
# SSOT: openspec/specs/openspec-workflow.md
# Consolidated BATS suite for the OpenSpec improvements batch (T001267).
# Covers the three acceptance criteria across the three sub-tickets:
#   - T001261: all SSOT specs declare ## Purpose + ## Requirements headers
#   - T001263: upstream /opsx:* commands are installed in both AI runtimes
#   - T001265: CI workflows opt out of OpenSpec telemetry (OPENSPEC_TELEMETRY: '0')
#
# Convention: one .bats file per OpenSpec SSOT spec.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

# ── T001261: SSOT spec structure guards ───────────────────────────────#

@test "T001261: every SSOT spec in openspec/specs/ declares a ## Purpose header" {
  local missing=0
  for f in "$REPO"/openspec/specs/*.md; do
    grep -q '^## Purpose' "$f" || { echo "MISSING ## Purpose: $f"; missing=1; }
  done
  [ "$missing" -eq 0 ]
}

@test "T001261: every SSOT spec in openspec/specs/ declares a ## Requirements header" {
  local missing=0
  for f in "$REPO"/openspec/specs/*.md; do
    grep -q '^## Requirements' "$f" || { echo "MISSING ## Requirements: $f"; missing=1; }
  done
  [ "$missing" -eq 0 ]
}

@test "T001261: openspec-validate.ts enforces ## Purpose + ## Requirements on SSOT specs" {
  local f="$REPO/scripts/openspec-validate.ts"
  [ -f "$f" ]
  grep -q '## Purpose' "$f"
  grep -q '## Requirements' "$f"
}

# ── T001263: upstream /opsx:* command guards ─────────────────────────#

@test "T001263: .opencode/commands/opsx-propose.md is installed" {
  [ -f "$REPO/.opencode/commands/opsx-propose.md" ]
}

@test "T001263: .opencode/commands/opsx-apply.md is installed" {
  [ -f "$REPO/.opencode/commands/opsx-apply.md" ]
}

@test "T001263: .claude/skills/openspec-propose/SKILL.md is installed" {
  [ -f "$REPO/.claude/skills/openspec-propose/SKILL.md" ]
}

@test "T001263: .claude/skills/openspec-apply-change/SKILL.md is installed" {
  [ -f "$REPO/.claude/skills/openspec-apply-change/SKILL.md" ]
}

@test "T001263: dev-flow-plan SKILL.md references /opsx:propose" {
  local f="$REPO/.claude/skills/dev-flow-plan/SKILL.md"
  [ -f "$f" ]
  grep -q '/opsx:propose' "$f"
}

@test "T001263: dev-flow-execute SKILL.md references /opsx:apply" {
  local f="$REPO/.claude/skills/dev-flow-execute/SKILL.md"
  [ -f "$f" ]
  grep -q '/opsx:apply' "$f"
}

# ── T001265: CI telemetry opt-out + rules + AGENTS docs ──────────────#

@test "T001265: every CI workflow sets OPENSPEC_TELEMETRY: '0'" {
  local missing=0
  for f in "$REPO"/.github/workflows/*.yml "$REPO"/.github/workflows/*.yaml; do
    [ -f "$f" ] || continue
    grep -q 'OPENSPEC_TELEMETRY' "$f" || { echo "MISSING OPENSPEC_TELEMETRY: $f"; missing=1; }
  done
  [ "$missing" -eq 0 ]
}

@test "T001265: openspec/config.yaml declares specs: rule category" {
  local f="$REPO/openspec/config.yaml"
  [ -f "$f" ]
  grep -Eq '^[[:space:]]+specs:' "$f"
}

@test "T001265: openspec/config.yaml declares design: rule category" {
  local f="$REPO/openspec/config.yaml"
  [ -f "$f" ]
  grep -Eq '^[[:space:]]+design:' "$f"
}

@test "T001265: AGENTS.md documents OpenSpec conventions" {
  local f="$REPO/AGENTS.md"
  [ -f "$f" ]
  grep -qi 'openspec conventions\|OpenSpec conventions' "$f"
}

@test "T001265: AGENTS.md documents Dev experience (shell completions)" {
  local f="$REPO/AGENTS.md"
  [ -f "$f" ]
  grep -qi 'dev experience\|shell completions' "$f"
}
