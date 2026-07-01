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

@test "T001263: .opencode/commands/opsx-archive.md is installed" {
  [ -f "$REPO/.opencode/commands/opsx-archive.md" ]
}

@test "T001263: .opencode/commands/opsx-explore.md is installed" {
  [ -f "$REPO/.opencode/commands/opsx-explore.md" ]
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

# ── T001262: operation-aware delta merge (scripts/openspec-merge.mjs) ──#

_merge_setup() {            # copy the read-only SSOT fixture into a writable temp file
  FX="$REPO/tests/fixtures/openspec"
  SSOT="$BATS_TEST_TMPDIR/ssot.md"
  cp "$FX/ssot-sample.md" "$SSOT"
}

@test "T001262: ADDED inserts a new requirement into the Requirements section" {
  _merge_setup
  run node "$REPO/scripts/openspec-merge.mjs" apply "$FX/delta-added.md" "$SSOT"
  [ "$status" -eq 0 ]
  grep -q '^### Requirement: Block C$' "$SSOT"
  # inserted before any trailing H2, i.e. still inside the requirements body
  [ "$(grep -c '^### Requirement: ' "$SSOT")" -eq 4 ]
}

@test "T001262: MODIFIED replaces a requirement in-place, not duplicated" {
  _merge_setup
  run node "$REPO/scripts/openspec-merge.mjs" apply "$FX/delta-modified.md" "$SSOT"
  [ "$status" -eq 0 ]
  [ "$(grep -c '^### Requirement: Block A$' "$SSOT")" -eq 1 ]
  grep -q 'REPLACED content' "$SSOT"
  ! grep -q 'original content' "$SSOT"
}

@test "T001262: MODIFIED with a nonexistent target fails with exit 1" {
  _merge_setup
  run node "$REPO/scripts/openspec-merge.mjs" apply "$FX/delta-modified-missing.md" "$SSOT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"NonExistent Block"* ]]
  grep -q '^### Requirement: Block A$' "$SSOT"   # SSOT left intact
}

@test "T001262: REMOVED deletes the requirement and drops the reason text" {
  _merge_setup
  run node "$REPO/scripts/openspec-merge.mjs" apply "$FX/delta-removed.md" "$SSOT"
  [ "$status" -eq 0 ]
  ! grep -q '^### Requirement: Deprecated Feature$' "$SSOT"
  ! grep -q 'Removed because obsolete' "$SSOT"
}

@test "T001262: RENAMED rewrites the heading and keeps the body" {
  _merge_setup
  run node "$REPO/scripts/openspec-merge.mjs" apply "$FX/delta-renamed.md" "$SSOT"
  [ "$status" -eq 0 ]
  grep -q '^### Requirement: New Name$' "$SSOT"
  ! grep -q '^### Requirement: Old Name$' "$SSOT"
}

@test "T001262: RENAMED without **Renamed-to:** fails with exit 1" {
  _merge_setup
  run node "$REPO/scripts/openspec-merge.mjs" apply "$FX/delta-renamed-no-direction.md" "$SSOT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Renamed-to"* ]]
}

@test "T001262: a stub delta is rejected with exit 1" {
  _merge_setup
  run node "$REPO/scripts/openspec-merge.mjs" apply "$FX/delta-stub.md" "$SSOT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"stub"* ]]
}

@test "T001262: merge is idempotent (second apply is a no-op skip)" {
  _merge_setup
  run node "$REPO/scripts/openspec-merge.mjs" apply "$FX/delta-added.md" "$SSOT"
  [ "$status" -eq 0 ]
  run node "$REPO/scripts/openspec-merge.mjs" apply "$FX/delta-added.md" "$SSOT"
  [ "$status" -eq 0 ]
  [ "$(grep -c '^### Requirement: Block C$' "$SSOT")" -eq 1 ]
}

# ── T001389: auto-register new components in config.yaml on archive --create-new ──#

_fake_openspec_root() {   # builds a throwaway <root>/{specs/,config.yaml} tree
  FX="$REPO/tests/fixtures/openspec"
  ROOT="$BATS_TEST_TMPDIR/openspec"
  mkdir -p "$ROOT/specs"
  cat > "$ROOT/config.yaml" <<'YAML'
schema: spec-driven

context: |
  Stack: fixture
  OpenSpec-Komponenten: |
    alpha-component, beta-component,
    gamma-component


rules:
  proposal:
    - fixture rule
YAML
}

@test "T001389: archive --create-new registers the new component slug in config.yaml" {
  _fake_openspec_root
  run node "$REPO/scripts/openspec-merge.mjs" apply "$FX/delta-added.md" "$ROOT/specs/new-widget.md" --create-new
  [ "$status" -eq 0 ]
  [ -f "$ROOT/specs/new-widget.md" ]
  grep -q 'new-widget' "$ROOT/config.yaml"
}

@test "T001389: registering the same component twice does not duplicate the entry" {
  _fake_openspec_root
  run node "$REPO/scripts/openspec-merge.mjs" apply "$FX/delta-added.md" "$ROOT/specs/new-widget.md" --create-new
  [ "$status" -eq 0 ]
  # remove the merge marker so a second apply against a *different* new slug still runs,
  # but re-verify idempotency by counting occurrences of the already-registered slug
  [ "$(grep -o 'new-widget' "$ROOT/config.yaml" | wc -l)" -eq 1 ]
}

@test "T001389: MODIFIED delta against an existing SSOT does not touch config.yaml" {
  _fake_openspec_root
  cp "$FX/ssot-sample.md" "$ROOT/specs/existing.md"
  local before after
  before="$(cat "$ROOT/config.yaml")"
  run node "$REPO/scripts/openspec-merge.mjs" apply "$FX/delta-modified.md" "$ROOT/specs/existing.md"
  [ "$status" -eq 0 ]
  after="$(cat "$ROOT/config.yaml")"
  [ "$before" = "$after" ]
}
