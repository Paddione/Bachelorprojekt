#!/usr/bin/env bats
# tests/spec/coaching-sessions-polish-guide.bats
# SSOT: openspec/specs/coaching-sessions-polish-guide.md + admin-nav-accordion.md
# Structural assertions for the coaching-sessions-admin-ux change (T001638).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  WEB="$REPO_ROOT/website/src"
}

@test "sidebar has a Sessions nav item in Geschäft section" {
  run grep -qF "{ href: '/admin/coaching/sessions', label: 'Sessions'" "$WEB/components/admin/AdminSidebarNav.astro"
  [ "$status" -eq 0 ]
}

@test "Studio nav item no longer matches the sessions path" {
  run grep -qF "matches: ['/admin/coaching/studio', '/admin/fragebogen']" "$WEB/components/admin/AdminSidebarNav.astro"
  [ "$status" -eq 0 ]
}

@test "dashboard tile label reads Sessions not Sitzungen" {
  run grep -qF "label: 'Sessions'" "$WEB/pages/admin.astro"
  [ "$status" -eq 0 ]
  run grep -qF "label: 'Sitzungen'" "$WEB/pages/admin.astro"
  [ "$status" -ne 0 ]
}
