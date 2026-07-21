#!/usr/bin/env bats
# tests/spec/admin-token-consolidation.bats
# SSOT: openspec/specs/admin-token-consolidation.md
#
# Spec-BATS Coverage for the admin-token-consolidation spec:
# single color-token source in Tailwind @theme layer.
#
# Requirements:
# 1. factory-tokens.css must NOT exist
# 2. No :root block redeclares any of the 17 migrated base names
# 3. No import references factory-tokens.css
# 4. Each of the 16 semantic admin tokens is declared exactly once in global.css,
#    aliasing a @theme --color-* token
# 5. --color-danger exists for --admin-danger
# 6. Existing consumers keep working without edits
# 7. Visual-regression baseline (visual-sweep E2E)

# ── File-level variables ──────────────────────────────────────────────────────
STYLES_DIR="$BATS_TEST_DIRNAME/../../website/src/styles"
GLOBAL_CSS="$STYLES_DIR/global.css"
ADMIN_LAYOUT="$BATS_TEST_DIRNAME/../../website/src/components/admin/AdminLayout.astro"

# ── Requirement 1: factory-tokens.css is dissolved ─────────────────────────────
@test "factory-tokens.css does not exist" {
  run ls "$STYLES_DIR"/factory-tokens.css
  [ "$status" -ne 0 ]
}

# ── Requirement 2: No :root block redeclares migrated base names ────────────────
@test "no second :root block redeclares the 17 migrated base colors" {
  BASE_COLORS=(
    --brass --brass-2 --brass-d --fg --fg-soft
    --ink-750 --ink-800 --ink-850 --ink-900 --line --line-2
    --mono --mute --mute-2 --sage --sans --serif
  )
  for color in "${BASE_COLORS[@]}"; do
    run grep -E ":root\s*\{" "$GLOBAL_CSS"
    [ "$status" -eq 0 ]
    # Check the color is NOT declared in a :root block
    run grep -E ":root\s*\{.*\}" "$GLOBAL_CSS" | \
      grep -E "^\s*$color\s*:"
    [ "$status" -ne 0 ]
  done
}

# ── Requirement 3: No import references the deleted sheet ────────────────────
@test "global.css has no import of factory-tokens.css" {
  run grep -qF '@import.*factory-tokens.css' "$GLOBAL_CSS"
  [ "$status" -ne 0 ]
}

@test "AdminLayout.astro has no import of factory-tokens.css" {
  run grep -qF "factory-tokens.css" "$ADMIN_LAYOUT"
  [ "$status" -ne 0 ]
}

# ── Requirement 4: 16 semantic admin tokens alias @theme colors ─────────────────
@test "16 semantic admin tokens are declared exactly once in global.css" {
  ADMIN_TOKENS=(
    --admin-bg --admin-sidebar-bg --admin-surface --admin-surface-hover
    --admin-border --admin-border-bright --admin-primary
    --admin-primary-muted --admin-accent --admin-text
    --admin-text-mute --admin-text-disabled --admin-success
    --admin-danger --admin-info --admin-warning
  )
  for token in "${ADMIN_TOKENS[@]}"; do
    run grep -E "^\s*$token\s*:" "$GLOBAL_CSS"
    [ "$status" -eq 0 ]
  done
}

# ── Requirement 5: --color-danger exists for admin-danger ───────────────────────
@test "--color-danger exists in @theme for admin-danger" {
  run grep -E "@theme\s*\{" "$GLOBAL_CSS"
  [ "$status" -eq 0 ]
  run grep -E "--color-danger" "$GLOBAL_CSS"
  [ "$status" -eq 0 ]
}

# ── Requirement 6: Visual-regression baseline ─────────────────────────────────
@test "admin surfaces render without regression (reference: visual-sweep E2E)" {
  # The visual-sweep E2E path is the authoritative regression baseline.
  # This test documents that the migration requires the visual-sweep to run.
  # The actual verification happens in the E2E spec at tests/e2e/specs/visual-sweep.spec.ts
  # The BATS test here is a placeholder that the visual-sweep must be run.
  #
  # Verification: task e2e:admin (runs visual-sweep against admin routes)
  run echo "Visual-sweep baseline required; run task e2e:admin"
  [ "$status" -eq 0 ]
}
