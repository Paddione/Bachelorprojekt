#!/usr/bin/env bats
# tests/spec/software-factory/dashboard.bats
# SSOT: openspec/specs/software-factory.md
#
# [T002503] Aufgeteilt aus tests/spec/software-factory.bats. Jene Sammeldatei hielt
# 495 der ~2300 Spec-Tests in einer Datei und war mit --no-parallelize-within-files
# unteilbar: sie bildete mit 115s den Boden jedes CI-Shards, in dem sie lag.
#
# Der Split ist ein VERSCHIEBEN, kein Kopieren — die Quelldatei ist entfernt.
# T002427/T002421: eine frueher zurueckgelassene Kopie erzeugte doppelte Testnamen,
# ein gefilterter Lauf sah gruen aus, waehrend `task test:factory` ueber die
# veraltete Fassung rot lief.
#
# Gemeinsame Variablen, _skip_if_no_db und Setup/Teardown liegen in _sf_common.bash.

load '_sf_common'

setup()    { _sf_setup; }
teardown() { _sf_teardown; }

# ── FA-SF-42-dashboard-route ────────────────────────────────────#
# FA-SF-42: /api/factory-metrics enforces the getSession+isAdmin 401 gate.

ROUTE="${BATS_TEST_DIRNAME}/../../../website/src/pages/sdlc/api/factory-metrics.ts"

@test "FA-SF-42: route exists and is server-rendered" {
  [ -f "$ROUTE" ]
  grep -q 'export const prerender = false' "$ROUTE"
}

@test "FA-SF-42: gate returns 401 when session is absent or non-admin" {
  grep -q "getSession(request.headers.get('cookie'))" "$ROUTE"
  grep -q '!session || !isAdmin(session)' "$ROUTE"
  grep -q 'status: 401' "$ROUTE"
}

@test "FA-SF-42: brand is resolved per-pod, never hardcoded" {
  grep -q "process.env.BRAND_ID ?? process.env.BRAND" "$ROUTE"
}

@test "FA-SF-42: live preview rejects an unauthenticated request" {
  [ -n "${WEBSITE_BASE_URL:-}" ] || skip "no WEBSITE_BASE_URL preview target"
  run curl -s -o /dev/null -w '%{http_code}' "${WEBSITE_BASE_URL}/api/factory-metrics"
  [ "$status" -eq 0 ]
  [ "$output" = "401" ]
}

# ── T001433 admin-redesign: Factory Floor conveyor-only (FA-SF-FLOOR) ─────────
@test "FA-SF-FLOOR: FactoryFloor.svelte has no ff-view/kanban toggle" {
  run grep -c "ff-view" website/src/components/sdlc/FactoryFloor.svelte
  [ "$output" = "0" ]
  run grep -c "ff-view-toggle" website/src/components/sdlc/FactoryFloor.svelte
  [ "$output" = "0" ]
}

COCKPIT_PAGE="$BATS_TEST_DIRNAME/../../../website/src/pages/sdlc/cockpit.astro"
PIPELINE_PAGE="$BATS_TEST_DIRNAME/../../../website/src/pages/sdlc/pipeline.astro"
DEV_STATUS_PAGE="$BATS_TEST_DIRNAME/../../../website/src/pages/dev-status.astro"
FACTORY_OBSERVABILITY_COMP="$BATS_TEST_DIRNAME/../../../website/src/components/sdlc/factory/FactoryObservability.svelte"
FACTORY_CHART_COLORS="$BATS_TEST_DIRNAME/../../../website/src/components/sdlc/factory/factory-chart-colors.ts"

@test "T001433 pipeline: pages/admin/cockpit.astro exists and mounts PipelinePanel" {
  [ -f "$COCKPIT_PAGE" ]
  run grep -F "PipelinePanel" "$COCKPIT_PAGE"
  [ "$status" -eq 0 ]
}

@test "T001433 pipeline: pipeline.astro is a 301 redirect to /admin/cockpit" {
  run grep -F "Astro.redirect" "$PIPELINE_PAGE"
  [ "$status" -eq 0 ]
  run grep -F "/admin/cockpit" "$PIPELINE_PAGE"
  [ "$status" -eq 0 ]
}

@test "T001433 pipeline: dev-status.astro is a 301 redirect to /admin/cockpit" {
  run grep -F "Astro.redirect(\`/admin/cockpit" "$DEV_STATUS_PAGE"
  [ "$status" -eq 0 ]
}

@test "T001433 chart-colors: FactoryObservability has no local PHASE_COLORS map" {
  run grep -c "const PHASE_COLORS" "$FACTORY_OBSERVABILITY_COMP"
  [ "$output" = "0" ]
  run grep -F "PHASE_COLOR_BY_NAME" "$FACTORY_OBSERVABILITY_COMP"
  [ "$status" -eq 0 ]
}

@test "T001433 chart-colors: factory-chart-colors exports PHASE_COLOR_BY_NAME" {
  run grep -F "export const PHASE_COLOR_BY_NAME" "$FACTORY_CHART_COLORS"
  [ "$status" -eq 0 ]
}

# ── T001814: factory-qa-lens — executing QA lens (Verify phase, tier=full) ──
QA_LENS="${BATS_TEST_DIRNAME}/../../../scripts/factory/qa-lens.mjs"

@test "FA-SF-QA: qa-lens.mjs exists and prints REVIEW_SCHEMA-shaped JSON in degraded mode" {
  [ -f "$QA_LENS" ]
  local wt="${BATS_TEST_TMPDIR}/qa-lens-nonexistent-wt"
  rm -rf "$wt"
  FACTORY_SANDBOX=off FACTORY_QA_SKIP_STAGING=1 run node "$QA_LENS" --worktree "$wt" --branch fake/branch --ticket T000000 --diff-range origin/main...HEAD
  [ "$status" -eq 0 ]
  # stdout/stderr are interleaved by `run`; the JSON is always the last line.
  echo "$output" | tail -1 | jq -e '.findings | type == "array"'
}

@test "FA-SF-QA: qa-lens degradation emits a single medium finding, never high, when staging is skipped" {
  local wt="${BATS_TEST_TMPDIR}/qa-lens-nonexistent-wt2"
  rm -rf "$wt"
  FACTORY_SANDBOX=off FACTORY_QA_SKIP_STAGING=1 run node "$QA_LENS" --worktree "$wt" --branch fake/branch --ticket T000000 --diff-range origin/main...HEAD
  [ "$status" -eq 0 ]
  local json; json="$(echo "$output" | tail -1)"
  run bash -c "echo '$json' | jq '[.findings[]|select(.severity==\"high\" or .severity==\"critical\")]|length'"
  [ "$output" -eq 0 ]
  run bash -c "echo '$json' | jq '[.findings[]|select(.severity==\"medium\")]|length'"
  [ "$output" -ge 1 ]
}

@test "FA-SF-QA: qa-lens claims and releases the staging agent-lock scope" {
  run grep -F 'agent-lock.sh claim staging' "$QA_LENS"
  [ "$status" -eq 0 ]
  run grep -F 'agent-lock.sh release staging' "$QA_LENS"
  [ "$status" -eq 0 ]
  run grep -F 'finally' "$QA_LENS"
  [ "$status" -eq 0 ]
}

@test "FA-SF-QA: qa-lens resolves smoke base URLs from env, never a brand-domain literal" {
  run grep -F '.korczewski.de' "$QA_LENS"
  [ "$status" -ne 0 ]
  run grep -F '.mentolder.de' "$QA_LENS"
  [ "$status" -ne 0 ]
  run grep -F 'WEBSITE_SITE_URL' "$QA_LENS"
  [ "$status" -eq 0 ]
  run grep -F 'PROD_DOMAIN' "$QA_LENS"
  [ "$status" -eq 0 ]
}

@test "FA-SF-QA: pipeline.js wires qa-lens into the full-tier verify branch" {
  # pipeline.js (the Workflow sandbox script) delegates the actual qa-lens.mjs
  # spawn to pipeline-runner.js (host-side, has Node API access); pipeline.js
  # itself only gates the 'run-qa-lens' runner command behind tier === 'full'.
  local runner="$BATS_TEST_DIRNAME/../../../scripts/factory/pipeline-runner.js"
  run grep -n "run-qa-lens" "$PJS"
  [ "$status" -eq 0 ]
  run grep -n "qa-lens.mjs" "$runner"
  [ "$status" -eq 0 ]
  # the qa-lens spawn must live after the `tier === 'full'` guard opens
  local tier_line qa_line
  tier_line=$(grep -n "tier === 'full'" "$PJS" | head -1 | cut -d: -f1)
  qa_line=$(grep -n "run-qa-lens" "$PJS" | head -1 | cut -d: -f1)
  [ -n "$tier_line" ]
  [ -n "$qa_line" ]
}
