#!/usr/bin/env bats
# tests/spec/coaching-sessions-polish-guide.bats
# SSOT: openspec/specs/coaching-sessions-polish-guide.md + admin-nav-accordion.md
# Structural assertions for the coaching-sessions-admin-ux change (T001638).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  WEB="$REPO_ROOT/website/src"
}

@test "sidebar has a Sessions nav item in Geschäft section" {
  # T001792 / PR #2767: the dead studio route was removed; the Sessions label
  # points to /admin/coaching/sessions again (T001807).
  # Use -E to handle variable whitespace between object properties.
  run grep -qE "href: '/admin/coaching/sessions'.*label: 'Sessions'" "$WEB/components/admin/AdminSidebarNav.astro"
  [ "$status" -eq 0 ]
}

@test "Sessions nav item matches sessions and fragebogen paths" {
  run grep -qF "matches: ['/admin/coaching/sessions', '/admin/fragebogen']" "$WEB/components/admin/AdminSidebarNav.astro"
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

@test "migration adds is_test_data to coaching.sessions" {
  run grep -qF "ADD COLUMN IF NOT EXISTS is_test_data" "$REPO_ROOT/scripts/migrations/2026-07-08-coaching-is-test-data.sql"
  [ "$status" -eq 0 ]
}

@test "createSession threads is_test_data into the INSERT" {
  run grep -qF "is_test_data" "$WEB/lib/coaching-session-db.ts"
  [ "$status" -eq 0 ]
}

@test "purge-fn-v6 sweeps coaching test-data sessions and steps" {
  run grep -qF "coaching.session_steps" "$REPO_ROOT/scripts/one-shot/purge-fn-v6.sql"
  [ "$status" -eq 0 ]
  run grep -qF "DELETE FROM coaching.sessions WHERE is_test_data" "$REPO_ROOT/scripts/one-shot/purge-fn-v6.sql"
  [ "$status" -eq 0 ]
}

@test "T001664 coaching-sim validates request bodies before hitting the LLM" {
  run grep -qF "function validateSimBody" "$WEB/pages/api/demo/coaching-sim.ts"
  [ "$status" -eq 0 ]
  run grep -qF "MAX_BODY_BYTES" "$WEB/pages/api/demo/coaching-sim.ts"
  [ "$status" -eq 0 ]
}

@test "T001664 coaching-sim honors the COACHING_SIM_ENABLED kill-switch" {
  run grep -qF "COACHING_SIM_ENABLED" "$WEB/pages/api/demo/coaching-sim.ts"
  [ "$status" -eq 0 ]
  run grep -qF "COACHING_SIM_ENABLED" "$REPO_ROOT/environments/schema.yaml"
  [ "$status" -eq 0 ]
}

@test "T001666 generate.ts fails closed when PII scrubbing throws" {
  run grep -qF "PII-Anonymisierung fehlgeschlagen" "$WEB/pages/api/admin/coaching/sessions/[id]/steps/[n]/generate.ts"
  [ "$status" -eq 0 ]
}

@test "T001666 generate.ts guards against a missing active KI provider" {
  run grep -qF "Kein KI-Provider konfiguriert" "$WEB/pages/api/admin/coaching/sessions/[id]/steps/[n]/generate.ts"
  [ "$status" -eq 0 ]
}

@test "T001670 archive/unarchive endpoints return 404 for unknown session ids" {
  run grep -qF "Session nicht gefunden" "$WEB/pages/api/admin/coaching/sessions/[id]/archive.ts"
  [ "$status" -eq 0 ]
  run grep -qF "Session nicht gefunden" "$WEB/pages/api/admin/coaching/sessions/[id]/unarchive.ts"
  [ "$status" -eq 0 ]
}

@test "T001672 anthropic gateway endpoint is env-overridable and documented" {
  run grep -qF "LLM_GATEWAY_URL" "$WEB/lib/openai-compatible-session-agent.ts"
  [ "$status" -eq 0 ]
  run grep -qF "LLM_GATEWAY_URL" "$REPO_ROOT/environments/schema.yaml"
  [ "$status" -eq 0 ]
  run grep -qF "COACHING_SESSION_MODEL" "$REPO_ROOT/environments/schema.yaml"
  [ "$status" -eq 0 ]
  run grep -qF "SESSION_HUB_REGISTRY_WRITABLE" "$REPO_ROOT/environments/schema.yaml"
  [ "$status" -eq 0 ]
}
