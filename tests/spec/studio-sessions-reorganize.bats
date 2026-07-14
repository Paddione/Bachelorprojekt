#!/usr/bin/env bats
# tests/spec/studio-sessions-reorganize.bats
# SSOT: docs/superpowers/specs/2026-07-08-studio-sessions-reorganize-design.md
# Verification for reorganizing Studio and Sessions views.
# Post-T001792 (PR #2767): the dead coaching studio route was removed entirely;
# /admin/coaching/sessions is the canonical Sessions surface. The assertions
# below verify the post-removal state (T001807).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  WEB="$REPO_ROOT/website/src"
}

@test "sidebar Sessions item points to coaching/sessions and matches sessions and fragebogen" {
  run grep -qF "href: '/admin/coaching/sessions',   label: 'Sessions',     icon: 'clipboard', matches: ['/admin/coaching/sessions', '/admin/fragebogen']" "$WEB/components/admin/AdminSidebarNav.astro"
  [ "$status" -eq 0 ]
}

@test "sidebar does not reference the removed coaching studio route" {
  run grep -qF "href: '/admin/coaching/studio'" "$WEB/components/admin/AdminSidebarNav.astro"
  [ "$status" -ne 0 ]
}

@test "sessions index page references neither projects tab nor removed studio route" {
  run grep -qF "/admin/coaching/projekte" "$WEB/pages/admin/coaching/sessions/index.astro"
  [ "$status" -ne 0 ]
  run grep -qF "href=\"/admin/coaching/studio\"" "$WEB/pages/admin/coaching/sessions/index.astro"
  [ "$status" -ne 0 ]
}

@test "sessions overview does not contain Neue Session link" {
  run grep -qF "+ Neue Session" "$WEB/components/admin/coaching/SessionsOverview.svelte"
  [ "$status" -ne 0 ]
}

@test "coaching studio page wrapper was removed with the dead route" {
  [ ! -f "$WEB/pages/admin/coaching/studio.astro" ]
}

@test "coaching studio app.jsx has brand-sub set to Coaching Sessions" {
  run grep -qF "Coaching Sessions" "$WEB/../public/coaching-studio/app.jsx"
  [ "$status" -eq 0 ]
}
