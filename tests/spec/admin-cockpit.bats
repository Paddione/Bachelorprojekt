#!/usr/bin/env bats
# tests/spec/admin-cockpit.bats
# SSOT: openspec/specs/admin-cockpit.md
#
# Consolidated BATS suite for the admin cockpit (T001433 admin-redesign).
# Convention: one .bats file per OpenSpec SSOT spec.

# ── File-level variables ──────────────────────────────────────────────────────
EXPAND_ROW="$BATS_TEST_DIRNAME/../../website/src/components/admin/CockpitExpandRow.svelte"
FILTER_BAR="$BATS_TEST_DIRNAME/../../website/src/components/admin/Cockpit/FilterBar.svelte"
TICKET_ROW="$BATS_TEST_DIRNAME/../../website/src/components/admin/TicketRow.svelte"

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
  WEB="$BATS_TEST_DIRNAME/../../website/src"
  run grep -qF "CoachingSettings" "$WEB/pages/admin/coaching/settings.astro"
  [ "$status" -eq 0 ]
  run grep -qF "client:load" "$WEB/pages/admin/coaching/settings.astro"
  [ "$status" -eq 0 ]
}
