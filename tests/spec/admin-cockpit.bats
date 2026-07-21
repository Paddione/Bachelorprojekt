#!/usr/bin/env bats
# tests/spec/admin-cockpit.bats
# SSOT: openspec/specs/admin-cockpit.md
#
# Consolidated BATS suite for the admin cockpit (T001433 admin-redesign).
# Convention: one .bats file per OpenSpec SSOT spec.
#
# Added tests for consolidated micro-specs:
# - admin-content-db (T001787)
# - admin-nav-accordion (T001869)

# ── File-level variables ──────────────────────────────────────────────────────
EXPAND_ROW="$BATS_TEST_DIRNAME/../../website/src/components/admin/CockpitExpandRow.svelte"
FILTER_BAR="$BATS_TEST_DIRNAME/../../website/src/components/admin/Cockpit/FilterBar.svelte"
TICKET_ROW="$BATS_TEST_DIRNAME/../../website/src/components/admin/TicketRow.svelte"
ADMIN_SIDEBAR="$BATS_TEST_DIRNAME/../../website/src/components/admin/AdminSidebarNav.astro"
ADMIN_COCKPIT="$BATS_TEST_DIRNAME/../../website/src/components/admin/Cockpit.svelte"
WEB="$BATS_TEST_DIRNAME/../../website/src"

# ── T001433: Cockpit expand row ───────────────────────────────────────────────
@test "T001433 expand: CockpitExpandRow.svelte exists" {
  [ -f "$EXPAND_ROW" ]
}

@test "T001433 expand: TicketRow still has /admin/tickets/ link" {
  run grep -E 'href="/admin/tickets/' "$TICKET_ROW"
  [ "$status" -eq 0 ]
}

# ── T001433: Cockpit toolbar icon buttons ─────────────────────────────────────
@test "T001433 toolbar: FilterBar has no emoji glyphs (folder/save/link use SVG icons)" {
  for emoji in "📂" "💾" "🔗"; do
    run grep -F "$emoji" "$FILTER_BAR"
    [ "$output" = "" ] || [ "$status" -ne 0 ]
  done
}

@test "T001433 toolbar: FilterBar references icons.folder, icons.save, icons.link" {
  for k in "icons.folder" "icons.save" "icons.link"; do
    run grep -F "$k" "$FILTER_BAR"
    [ "$status" -eq 0 ]
  done
}

@test "T001665 coaching settings page mounts CoachingSettings component" {
  run grep -qF "CoachingSettings" "$WEB/pages/admin/coaching/settings.astro"
  [ "$status" -eq 0 ]
  run grep -qF "client:load" "$WEB/pages/admin/coaching/settings.astro"
  [ "$status" -eq 0 ]
}

# ── Consolidated micro-specs ──────────────────────────────────────────────────

# ── admin-content-db (T001787) ────────────────────────────────────────────────
@test "admin-content-db: ContentDb.svelte component exists" {
  [ -f "$WEB/components/admin/ContentDb.svelte" ]
}

@test "admin-content-db: ContentDb.svelte renders content database table" {
  run grep -qF "ContentDb" "$WEB/components/admin/ContentDb.svelte"
  [ "$status" -eq 0 ]
}

# ── admin-nav-accordion (T001869) ─────────────────────────────────────────────
@test "admin-nav-accordion: AdminSidebarNav.astro exists" {
  [ -f "$ADMIN_SIDEBAR" ]
}

@test "admin-nav-accordion: AdminSidebarNav has accordion toggle" {
  run grep -qF "accordion" "$ADMIN_SIDEBAR"
  [ "$status" -eq 0 ]
}

@test "admin-nav-accordion: AdminSidebarNav has sidebar-group-btn" {
  run grep -qF "sidebar-group-btn" "$ADMIN_SIDEBAR"
  [ "$status" -eq 0 ]
}

@test "admin-nav-accordion: AdminSidebarNav has accordion-arrow" {
  run grep -qF "accordion-arrow" "$ADMIN_SIDEBAR"
  [ "$status" -eq 0 ]
}

@test "admin-nav-accordion: AdminSidebarNav has collapsed toggle logic" {
  run grep -qE "is-collapsed|collapsed" "$ADMIN_SIDEBAR"
  [ "$status" -eq 0 ]
}

@test "admin-nav-accordion: AdminSidebarNav toggles collapse state on click" {
  run grep -qF "addEventListener.*click" "$ADMIN_SIDEBAR" || \
  run grep -qF "addEventListener" "$ADMIN_SIDEBAR"
  [ "$status" -eq 0 ]
}

@test "admin-nav-accordion: AdminSidebarNav has workshop section" {
  run grep -qF "Werkstatt" "$ADMIN_SIDEBAR" || \
  run grep -qF "workshop" "$ADMIN_SIDEBAR"
  [ "$status" -eq 0 ]
}

@test "admin-nav-accordion: AdminSidebarNav has infrastructure section" {
  run grep -qF "Infrastruktur" "$ADMIN_SIDEBAR" || \
  run grep -qF "infrastruktur" "$ADMIN_SIDEBAR" || \
  run grep -qF "infrastruktur" "$ADMIN_SIDEBAR"
  [ "$status" -eq 0 ]
}

# ── AdminCockpit ─────────────────────────────────────────────────────────────
@test "AdminCockpit.svelte exists" {
  [ -f "$ADMIN_COCKPIT" ]
}
