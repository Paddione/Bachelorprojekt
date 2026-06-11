#!/usr/bin/env bats

load test_helper

setup_file() {
  export RENDERED="${BATS_FILE_TMPDIR}/rendered.yaml"
  kubectl kustomize "${PROJECT_DIR}/k3d" --load-restrictor=LoadRestrictionsNone > "$RENDERED" 2>&1
  export ENDPOINT="${PROJECT_DIR}/website/src/pages/api/cron/scheduled-publish.ts"
  export DB="${PROJECT_DIR}/website/src/lib/newsletter-db.ts"
}

@test "scheduled-publish CronJob is registered in base kustomization" {
  run grep -F "name: scheduled-publish" "$RENDERED"
  assert_success
}

@test "scheduled-publish CronJob runs every 5 minutes in Europe/Berlin" {
  run grep -F "*/5 * * * *" "$RENDERED"
  assert_success
  run grep -F "Europe/Berlin" "$RENDERED"
  assert_success
}

@test "scheduled-publish CronJob uses Forbid concurrency (no double-send)" {
  run grep -F "concurrencyPolicy: Forbid" "$RENDERED"
  assert_success
}

@test "cron endpoint requires Bearer auth and returns 401 on mismatch" {
  run grep -F "status: 401" "$ENDPOINT"
  assert_success
  run grep -F 'Bearer ${CRON_SECRET}' "$ENDPOINT"
  assert_success
}

@test "lock query is atomic: status='scheduled' guarded UPDATE" {
  run grep -F "WHERE id = \$1 AND status = 'scheduled' AND scheduled_publish_at <= now()" "$DB"
  assert_success
}

@test "stale sending locks are reset after 10 minutes" {
  run grep -F "INTERVAL '10 minutes'" "$DB"
  assert_success
}

@test "korczewski patch points scheduled-publish at its own namespace" {
  run grep -F "website.website-korczewski.svc.cluster.local/api/cron/scheduled-publish" \
    "${PROJECT_DIR}/prod-korczewski/patch-cronjob-urls.yaml"
  assert_success
}
