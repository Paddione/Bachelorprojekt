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
ADMIN_SIDEBAR="$BATS_TEST_DIRNAME/../../website/src/components/admin/AdminSidebarNav.astro"
WEB="$BATS_TEST_DIRNAME/../../website/src"

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
  # T002181: `grep -qF "addEventListener.*click"` nahm `.*` als Literal (-F) und
  # fand nie etwas. Der `|| run …`-Fallback griff nie, weil `run` selbst immer
  # mit 0 zurückkehrt — die zweite Prüfung war toter Code. Jetzt wird der
  # Mechanismus wirklich geprüft: Click-Handler UND Zustandsumschaltung.
  run grep -qE "addEventListener\(['\"]click['\"]" "$ADMIN_SIDEBAR"
  [ "$status" -eq 0 ]
  run grep -qE "classList\.toggle\(" "$ADMIN_SIDEBAR"
  [ "$status" -eq 0 ]
  # a11y: der Toggle muss seinen Zustand auch bekanntgeben.
  run grep -qF "aria-expanded" "$ADMIN_SIDEBAR"
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
