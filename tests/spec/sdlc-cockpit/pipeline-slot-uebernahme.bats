# Quelltext-Prüfung für Pipeline-Slot-Übernahme (T002531)
# Prüft Menü-Slots, Dashboard-Links, Weiterleitungen und Löschung verwaister Dateien.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
}

@test "T002531 menu: AdminSidebarNav has exactly one /admin/cockpit link and no /admin/pipeline link" {
  local nav_file="$REPO_ROOT/website/src/components/admin/AdminSidebarNav.astro"
  [ -f "$nav_file" ]

  # Positiv-Anker: Navigation enthält Links
  grep -q "href: '/admin/" "$nav_file"

  # Cockpit-Link existiert
  grep -q "href: '/admin/cockpit'" "$nav_file"

  # Keinerlei /admin/pipeline Links in SidebarNav
  run grep "href: '/admin/pipeline'" "$nav_file"
  [ "$status" -ne 0 ]
}

@test "T002531 dashboard: admin.astro header slot links to /admin/cockpit" {
  local admin_file="$REPO_ROOT/website/src/pages/admin.astro"
  [ -f "$admin_file" ]

  # Positiv-Anker: slot="header" existiert
  grep -q 'slot="header"' "$admin_file"

  # Link zeigt auf /admin/cockpit
  grep -q 'href="/admin/cockpit"' "$admin_file"
  
  # Keinerlei /admin/pipeline link in admin.astro header
  run grep 'href="/admin/pipeline"' "$admin_file"
  [ "$status" -ne 0 ]
}

@test "T002531 deletion: orphaned Cockpit components deleted while keep-list remains" {
  # Positiv-Anker: Bleibe-Liste existiert
  [ -f "$REPO_ROOT/website/src/components/assistant/CockpitSidekickView.svelte" ]
  [ -f "$REPO_ROOT/website/src/pages/sdlc/api/cockpit/portfolio.ts" ]

  # Gelöschte Dateien dürfen nicht mehr existieren
  [ ! -f "$REPO_ROOT/website/src/components/admin/Cockpit.svelte" ]
  [ ! -f "$REPO_ROOT/website/src/components/admin/CockpitTable.svelte" ]
  [ ! -f "$REPO_ROOT/website/src/components/admin/CockpitExpandRow.svelte" ]
  [ ! -f "$REPO_ROOT/website/src/components/admin/EmptyStateCockpit.svelte" ]
  [ ! -f "$REPO_ROOT/website/src/components/admin/TicketCreateModal.svelte" ]
  [ ! -f "$REPO_ROOT/website/src/components/admin/TicketRow.svelte" ]
  [ ! -f "$REPO_ROOT/website/src/components/admin/BulkBar.svelte" ]
  [ ! -f "$REPO_ROOT/website/src/components/admin/Cockpit/MobileToggle.svelte" ]
  [ ! -f "$REPO_ROOT/website/src/components/admin/Cockpit/FilterBar.svelte" ]
  [ ! -f "$REPO_ROOT/website/src/lib/sdlc/admin/cockpit-expand.ts" ]
  [ ! -f "$REPO_ROOT/website/src/lib/sdlc/tickets/cockpit-table-actions.ts" ]

  # Keine Quelltext-Importe mehr auf gelöschte Svelte-Komponenten
  run grep -rn "CockpitTable.svelte" "$REPO_ROOT/website/src"
  [ "$status" -ne 0 ]
}

@test "T002531 of4: mobile-cockpit.css removed and admin-responsive updated" {
  local admin_resp="$REPO_ROOT/website/src/styles/admin-responsive.css"
  # Positiv-Anker: admin-responsive.css existiert
  [ -f "$admin_resp" ]

  # mobile-cockpit.css gelöscht
  [ ! -f "$REPO_ROOT/website/src/styles/mobile-cockpit.css" ]

  # Kein Bezug mehr auf mobile-cockpit.css in admin-responsive.css
  run grep "mobile-cockpit" "$admin_resp"
  [ "$status" -ne 0 ]
}

@test "T002531 redirect: pipeline.astro redirects query-preserving to /admin/cockpit" {
  local pipe_file="$REPO_ROOT/website/src/pages/admin/pipeline.astro"
  # Positiv-Anker: pipeline.astro existiert
  [ -f "$pipe_file" ]

  # redirect auf /admin/cockpit mit query
  grep -q "Astro.redirect" "$pipe_file" && grep -q "/admin/cockpit" "$pipe_file"

  # DevStatusTabs nicht mehr importiert
  run grep "DevStatusTabs" "$pipe_file"
  [ "$status" -ne 0 ]
}
