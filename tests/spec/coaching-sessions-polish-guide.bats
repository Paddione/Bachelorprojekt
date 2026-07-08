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

@test "popout helper exports openPopout" {
  run grep -qE "export function openPopout" "$WEB/lib/popout.ts"
  [ "$status" -eq 0 ]
}

@test "popout route exists and renders SessionWizard" {
  [ -f "$WEB/pages/admin/coaching/sessions/[id]/popout.astro" ]
  run grep -qF "SessionWizard" "$WEB/pages/admin/coaching/sessions/[id]/popout.astro"
  [ "$status" -eq 0 ]
}

@test "session detail page wires a popout control" {
  run grep -qF "openPopout" "$WEB/pages/admin/coaching/sessions/[id].astro"
  [ "$status" -eq 0 ]
}

@test "coaching help content uses Coaching-Sessions" {
  run grep -qF "Coaching-Sessions" "$WEB/lib/helpContent.ts"
  [ "$status" -eq 0 ]
  run grep -qF "Coaching-Sitzungen" "$WEB/lib/helpContent.ts"
  [ "$status" -ne 0 ]
}

@test "brett auto-post message uses 'für diese Session'" {
  run grep -qF "für diese Session:" "$WEB/pages/api/admin/inbox/[id]/action.ts"
  [ "$status" -eq 0 ]
}
