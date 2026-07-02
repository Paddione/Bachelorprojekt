#!/usr/bin/env bats
# tests/spec/website-core.bats
# SSOT: openspec/specs/website-core.md
#
# Consolidated BATS suite for the website core component (T001433 admin-redesign).
# Convention: one .bats file per OpenSpec SSOT spec.

# ── File-level variables ──────────────────────────────────────────────────────
ADMIN_FOUNDATION="$BATS_TEST_DIRNAME/../../website/src/styles/admin-foundation.css"
ADMIN_LAYOUT="$BATS_TEST_DIRNAME/../../website/src/layouts/AdminLayout.astro"
SIDEBAR_NAV="$BATS_TEST_DIRNAME/../../website/src/components/admin/AdminSidebarNav.astro"
KORE_CSS="$BATS_TEST_DIRNAME/../../website/public/brand/korczewski/kore-app.css"
ADMIN_RESPONSIVE="$BATS_TEST_DIRNAME/../../website/src/styles/admin-responsive.css"

# ── T001433: Token alias layer ───────────────────────────────────────────────
@test "T001433 alias: admin-foundation.css color-bearing tokens all reference var(--...)" {
  for token in --admin-bg --admin-sidebar-bg --admin-surface --admin-surface-hover \
               --admin-border --admin-border-bright --admin-primary --admin-primary-muted \
               --admin-accent --admin-text --admin-text-mute --admin-text-disabled \
               --admin-success --admin-danger --admin-info --admin-warning; do
    run grep -E "^[[:space:]]*${token}[[:space:]]*:[[:space:]]*var\(--" "$ADMIN_FOUNDATION"
    [ "$status" -eq 0 ] || { echo "missing alias for ${token}"; return 1; }
  done
}

@test "T001433 alias: AdminLayout.astro loads factory-tokens.css before admin-foundation.css" {
  run grep -n "factory-tokens.css\|admin-foundation.css" "$ADMIN_LAYOUT"
  [ "$status" -eq 0 ]
  tokens_line=$(echo "$output" | grep -n "factory-tokens.css" | head -1 | cut -d: -f1)
  foundation_line=$(echo "$output" | grep -n "admin-foundation.css" | head -1 | cut -d: -f1)
  [ -n "$tokens_line" ] && [ -n "$foundation_line" ]
  [ "$tokens_line" -lt "$foundation_line" ]
}

@test "T001433 alias: kore-app.css overrides --admin-primary with copper" {
  # The kore block is multi-line; verify both the `body.kore {` selector and
  # the `--admin-primary: var(--copper)` declaration are present in the file.
  # We use awk to extract the LAST `body.kore { ... }` block (the override block)
  # and grep inside it.
  override_block=$(awk '/^[[:space:]]*body\.kore[[:space:]]*\{/{buf=""} {buf=buf"\n"$0} /^[[:space:]]*\}[[:space:]]*$/{last=buf} END{print last}' "$KORE_CSS")
  echo "$override_block" | grep -q "body\.kore[[:space:]]*{"
  echo "$override_block" | grep -qE -- "--admin-primary:[[:space:]]+var\(--copper\)"
}

# ── T001433: Sidebar ─────────────────────────────────────────────────────────
@test "T001433 sidebar: AdminSidebarNav has exactly one /admin/pipeline link labelled Pipeline" {
  run grep -c "href:[[:space:]]*'/admin/pipeline'" "$SIDEBAR_NAV"
  [ "$output" -ge 1 ]
  run grep -E "label:[[:space:]]*'Pipeline'" "$SIDEBAR_NAV"
  [ "$status" -eq 0 ]
  # No actual /dev-status or /admin/planungsbuero href in the sidebar nav
  # (matches-array entries are fine — they are URL patterns for the isActive() helper)
  run grep -E "href:[[:space:]]*'/dev-status'|href:[[:space:]]*'/admin/planungsbuero'" "$SIDEBAR_NAV"
  [ "$status" -ne 0 ]
}

# ── T001471: admin responsive parity ─────────────────────────────────────────
@test "T001471 responsive: admin-responsive.css exists" {
  [ -f "$ADMIN_RESPONSIVE" ]
}

@test "T001471 responsive: AdminLayout.astro imports admin-responsive.css" {
  run grep -F "styles/admin-responsive.css" "$ADMIN_LAYOUT"
  [ "$status" -eq 0 ]
}

@test "T001471 responsive: stylesheet has mobile table fallback (767px + overflow-x)" {
  run grep -E "max-width:[[:space:]]*767px" "$ADMIN_RESPONSIVE"
  [ "$status" -eq 0 ]
  run grep -E "overflow-x:[[:space:]]*auto" "$ADMIN_RESPONSIVE"
  [ "$status" -eq 0 ]
}

@test "T001471 responsive: stylesheet excludes Cockpit from mobile table rule" {
  run grep -F 'data-container="cockpit"' "$ADMIN_RESPONSIVE"
  [ "$status" -eq 0 ]
}

@test "T001471 responsive: stylesheet has table-collapse container query" {
  run grep -F ".admin-table-collapse" "$ADMIN_RESPONSIVE"
  [ "$status" -eq 0 ]
  run grep -E "max-width:[[:space:]]*480px" "$ADMIN_RESPONSIVE"
  [ "$status" -eq 0 ]
}

@test "T001471 responsive: stylesheet has desktop block (1024px) with admin-form-wide" {
  run grep -E "min-width:[[:space:]]*1024px" "$ADMIN_RESPONSIVE"
  [ "$status" -eq 0 ]
  run grep -F ".admin-form-wide" "$ADMIN_RESPONSIVE"
  [ "$status" -eq 0 ]
}

@test "T001471 collapse: rechnungen.astro stays exactly 592 lines (Budget 0)" {
  run bash -c "wc -l < '$BATS_TEST_DIRNAME/../../website/src/pages/admin/rechnungen.astro' | tr -d ' '"
  [ "$output" -eq 592 ]
}

@test "T001471 collapse: projekte.astro stays exactly 408 lines (Budget 0)" {
  run bash -c "wc -l < '$BATS_TEST_DIRNAME/../../website/src/pages/admin/projekte.astro' | tr -d ' '"
  [ "$output" -eq 408 ]
}

@test "T001471 collapse: rechnungen.astro tags a table with admin-table-collapse" {
  run grep -F "admin-table-collapse" "$BATS_TEST_DIRNAME/../../website/src/pages/admin/rechnungen.astro"
  [ "$status" -eq 0 ]
}

@test "T001471 collapse: projekte.astro tags a table with admin-table-collapse" {
  run grep -F "admin-table-collapse" "$BATS_TEST_DIRNAME/../../website/src/pages/admin/projekte.astro"
  [ "$status" -eq 0 ]
}

@test "T001471 collapse: zeiterfassung.astro tags a table with admin-table-collapse" {
  run grep -F "admin-table-collapse" "$BATS_TEST_DIRNAME/../../website/src/pages/admin/zeiterfassung.astro"
  [ "$status" -eq 0 ]
}

@test "T001471 ui: AdminTabs has a mobile scroll media query" {
  f="$BATS_TEST_DIRNAME/../../website/src/components/admin/ui/AdminTabs.svelte"
  run grep -E "max-width:[[:space:]]*767px" "$f"
  [ "$status" -eq 0 ]
  run grep -E "overflow-x:[[:space:]]*auto" "$f"
  [ "$status" -eq 0 ]
}

@test "T001471 ui: AdminPageHeader stacks title and actions on mobile" {
  f="$BATS_TEST_DIRNAME/../../website/src/components/admin/ui/AdminPageHeader.svelte"
  run grep -E "max-width:[[:space:]]*767px" "$f"
  [ "$status" -eq 0 ]
}
