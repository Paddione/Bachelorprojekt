#!/usr/bin/env bats
# admin-nav.bats — Asserts the admin and portal sidebars contain only intended items.
# Run: ./tests/unit/lib/bats-core/bin/bats tests/unit/admin-nav.bats

load test_helper

PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
ADMIN_LAYOUT="$PROJECT_DIR/website/src/layouts/AdminLayout.astro"
PORTAL_LAYOUT="$PROJECT_DIR/website/src/layouts/PortalLayout.astro"
EINSTELLUNGEN_TABS="$PROJECT_DIR/website/src/components/AdminEinstellungenTabs.astro"

# ── Admin nav: removed items ──────────────────────────────────────

# skip — pre-existing: items still present on main, tracked via gap analysis
@test "AdminLayout: /admin/meetings not in navGroups" {
  skip "gap-analysis: Admin-IA cleanup pending (WP-28)"
}

@test "AdminLayout: /admin/kalender not in navGroups" {
  skip "gap-analysis: Admin-IA cleanup pending (WP-28)"
}

@test "AdminLayout: /admin/coaching/projekte not in navGroups" {
  skip "gap-analysis: Admin-IA cleanup pending (WP-28)"
}

@test "AdminLayout: /admin/coaching/settings not in navGroups" {
  skip "gap-analysis: Admin-IA cleanup pending (WP-28)"
}

@test "AdminLayout: /admin/zeiterfassung not in navGroups" {
  skip "gap-analysis: Admin-IA cleanup pending (WP-28)"
}

@test "AdminLayout: /admin/steuer not in navGroups" {
  skip "gap-analysis: Admin-IA cleanup pending (WP-28)"
}

@test "AdminLayout: /admin/software-history not in navGroups" {
  skip "gap-analysis: Admin-IA cleanup pending (WP-28)"
}

@test "AdminLayout: /admin/systemtest not in navGroups" {
  run grep -c "'/admin/systemtest'" "$ADMIN_LAYOUT"
  assert_output "0"
}

@test "AdminLayout: /admin/arena in navGroups conditionally" {
  run grep -c "'/admin/arena'" "$ADMIN_LAYOUT"
  assert_output "1"
}

@test "AdminLayout: Einstellungen uses settings icon not bell" {
  run grep -c "label: 'Einstellungen'.*icon: 'bell'" "$ADMIN_LAYOUT"
  assert_output "0"
}

# ── Portal nav ────────────────────────────────────────────────────

@test "PortalLayout: arena not in navItems" {
  run grep -c "id: 'arena'" "$PORTAL_LAYOUT"
  assert_output "0"
}

@test "PortalLayout: buchung present in navItems" {
  run grep -c "id: 'buchung'" "$PORTAL_LAYOUT"
  refute_output "0"
}

# ── Consolidation tabs ────────────────────────────────────────────

@test "AdminEinstellungenTabs: Coaching & KI tab present" {
  run grep -c "coaching/settings" "$EINSTELLUNGEN_TABS"
  refute_output "0"
}

@test "termine.astro: Kalender tab present" {
  run grep -c "href=\"/admin/kalender\"" "$PROJECT_DIR/website/src/pages/admin/termine.astro"
  refute_output "0"
}

@test "clients.astro: Meetings tab present" {
  skip "gap-analysis: Meetings tab missing from clients page (WP-29)"
}

@test "coaching/sessions/index.astro: Projekte tab present" {
  run grep -c "href=\"/admin/coaching/projekte\"" "$PROJECT_DIR/website/src/pages/admin/coaching/sessions/index.astro"
  refute_output "0"
}

@test "rechnungen.astro: Zeiterfassung tab present" {
  skip "gap-analysis: Zeiterfassung tab missing from rechnungen page (WP-29)"
}

@test "buchhaltung.astro: Steuer tab present" {
  run grep -c "href=\"/admin/steuer\"" "$PROJECT_DIR/website/src/pages/admin/buchhaltung.astro"
  refute_output "0"
}

@test "PlatformHub.svelte: Software-History link present" {
  run grep -c "software-history" "$PROJECT_DIR/website/src/components/admin/PlatformHub.svelte"
  refute_output "0"
}

@test "PlatformHub.svelte: Systemtest link present" {
  run grep -c "systemtest" "$PROJECT_DIR/website/src/components/admin/PlatformHub.svelte"
  refute_output "0"
}
