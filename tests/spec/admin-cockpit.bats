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

# T003826: Die sieben vormaligen Assertions auf Akkordeon-Steuerelemente
# (`sidebar-group-btn`, `accordion-arrow`, `is-collapsed`, Click-Listener) und auf die
# Sektionsnamen „Werkstatt"/„Infrastruktur" sind ersatzlos entfallen. Sie greppten den
# Quelltext der Komponente und belegten damit die Schreibweise von Zeichenketten, nicht
# dass Navigation funktioniert (CLAUDE.md § Test-Resultats-Konvention, T002448-M4).
#
# Das Sidebar-Akkordeon gibt es nicht mehr: nach dem Entfernen der SDLC-Einträge
# verbleiben zu wenige Einträge, als dass ein Aufklappen etwas verbergen würde.
#
# An ihre Stelle tritt website/src/lib/admin/nav-items.test.ts — der Guard importiert die
# Nav-Definition samt resolveRedirect() und prüft das ERGEBNIS der Pfadauflösung: kein
# Eintrag darf über REDIRECT_MAP in einer /sdlc/-Route landen, die build-target.mjs bei
# BUILD_TARGET=prod aus dem Manifest entfernt.
#
# Der Existenz-Test oben bleibt: er prüft die Datei, nicht ihre Formatierung.
