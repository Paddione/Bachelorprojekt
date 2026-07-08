#!/usr/bin/env bats
# tests/spec/studio-sessions-reorganize.bats
# SSOT: docs/superpowers/specs/2026-07-08-studio-sessions-reorganize-design.md
# Verification for reorganizing Studio and Sessions views.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  WEB="$REPO_ROOT/website/src"
}

@test "sidebar has Studio item renamed to Sessions and matches studio and fragebogen" {
  run grep -qF "href: '/admin/coaching/studio',     label: 'Sessions',     icon: 'clipboard', matches: ['/admin/coaching/studio', '/admin/fragebogen']" "$WEB/components/admin/AdminSidebarNav.astro"
  [ "$status" -eq 0 ]
}

@test "sidebar does not contain separate coaching sessions nav item" {
  run grep -qF "href: '/admin/coaching/sessions'" "$WEB/components/admin/AdminSidebarNav.astro"
  [ "$status" -ne 0 ]
}

@test "sessions index page removes projects tab and has sessions-liste tab and sessions tab" {
  run grep -qF "/admin/coaching/projekte" "$WEB/pages/admin/coaching/sessions/index.astro"
  [ "$status" -ne 0 ]
  run grep -qF "href=\"/admin/coaching/sessions\"" "$WEB/pages/admin/coaching/sessions/index.astro"
  [ "$status" -eq 0 ]
  run grep -qF "href=\"/admin/coaching/studio\"" "$WEB/pages/admin/coaching/sessions/index.astro"
  [ "$status" -eq 0 ]
}

@test "sessions overview does not contain Neue Session link" {
  run grep -qF "+ Neue Session" "$WEB/components/admin/coaching/SessionsOverview.svelte"
  [ "$status" -ne 0 ]
}

@test "coaching studio page wrapper has Coaching Sessions title" {
  run grep -qF "<AdminLayout title=\"Coaching Sessions\">" "$WEB/pages/admin/coaching/studio.astro"
  [ "$status" -eq 0 ]
}

@test "coaching studio app.jsx has brand-sub set to Coaching Sessions" {
  run grep -qF "Coaching Sessions" "$WEB/../public/coaching-studio/app.jsx"
  [ "$status" -eq 0 ]
}
