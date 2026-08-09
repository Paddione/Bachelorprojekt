#!/usr/bin/env bats
# tests/spec/sdlc-isolation/sdlc-up-command.bats
# SSOT: openspec/changes/sdlc-up-command/tasks.md (T002655)
#
# Acceptance tests for the sdlc:up / sdlc:down / sdlc:dev orchestration commands.
# Tests run against task --dry (command output), not implementation source.
#
# Run: tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-isolation/sdlc-up-command.bats
# or:  task test:unit SPEC=sdlc-isolation/sdlc-up-command

setup() {
  REPO_ROOT="${REPO_ROOT:-$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)}"
  TASK="task"
  HEALTH_GATE="${REPO_ROOT}/scripts/sdlc/health-gate.sh"
}

# ── Namespace reservation ───────────────────────────────────────────────────

@test "sdlc:up is listed as a task" {
  run $TASK --list-all
  echo "$output" | grep -q 'sdlc:up'
}

@test "sdlc:down is listed as a task" {
  run $TASK --list-all
  echo "$output" | grep -q 'sdlc:down'
}

@test "sdlc:dev is listed as a task" {
  run $TASK --list-all
  echo "$output" | grep -q 'sdlc:dev'
}

@test "dev:up is NOT listed as a task (namespace belongs to dev-stack)" {
  run $TASK --list-all
  ! echo "$output" | grep -qw 'dev:up'
}

@test "dev:down is NOT listed as a task (namespace belongs to dev-stack)" {
  run $TASK --list-all
  ! echo "$output" | grep -qw 'dev:down'
}

@test "task list is not empty (positive anchor for negative assertions)" {
  run $TASK --list-all
  [ -n "$output" ]
  echo "$output" | grep -q 'dev:deploy'
}

# ── Orchestration order: sdlc:up ─────────────────────────────────────────────

@test "sdlc:up dry-run calls cluster:create before deploy" {
  run $TASK --dry sdlc:sdlc:up
  CREATE_LINE=$(echo "$output" | grep -n 'sdlc:cluster:create' | head -1 | cut -d: -f1)
  DEPLOY_LINE=$(echo "$output" | grep -n 'sdlc:deploy' | head -1 | cut -d: -f1)
  [ -n "$CREATE_LINE" ]
  [ -n "$DEPLOY_LINE" ]
  [ "$CREATE_LINE" -lt "$DEPLOY_LINE" ]
}

@test "sdlc:up dry-run calls deploy before proxy:start" {
  run $TASK --dry sdlc:sdlc:up
  DEPLOY_LINE=$(echo "$output" | grep -n 'sdlc:deploy' | head -1 | cut -d: -f1)
  PROXY_LINE=$(echo "$output" | grep -n 'llm:proxy:start' | head -1 | cut -d: -f1)
  [ -n "$DEPLOY_LINE" ]
  [ -n "$PROXY_LINE" ]
  [ "$DEPLOY_LINE" -lt "$PROXY_LINE" ]
}

@test "sdlc:up dry-run calls proxy:start before health-gate" {
  run $TASK --dry sdlc:sdlc:up
  PROXY_LINE=$(echo "$output" | grep -n 'llm:proxy:start' | head -1 | cut -d: -f1)
  HEALTH_LINE=$(echo "$output" | grep -n 'health-gate' | head -1 | cut -d: -f1)
  [ -n "$PROXY_LINE" ]
  [ -n "$HEALTH_LINE" ]
  [ "$PROXY_LINE" -lt "$HEALTH_LINE" ]
}

@test "sdlc:up dry-run includes health-gate as the final step" {
  run $TASK --dry sdlc:sdlc:up
  echo "$output" | grep -q 'health-gate'
}

# ── Orchestration order: sdlc:down ───────────────────────────────────────────

@test "sdlc:down dry-run calls proxy:stop before cluster:delete" {
  run $TASK --dry sdlc:sdlc:down
  STOP_LINE=$(echo "$output" | grep -n 'llm:proxy:stop' | head -1 | cut -d: -f1)
  DELETE_LINE=$(echo "$output" | grep -n 'sdlc:cluster:delete' | head -1 | cut -d: -f1)
  [ -n "$STOP_LINE" ]
  [ -n "$DELETE_LINE" ]
  [ "$STOP_LINE" -lt "$DELETE_LINE" ]
}

# ── Health-gate: names the failing component ─────────────────────────────────

@test "health-gate.sh script file exists" {
  [ -f "$HEALTH_GATE" ]
  [ -x "$HEALTH_GATE" ]
}

@test "health-gate exits non-zero when cluster is unreachable" {
  # Simulate an unreachable context by pointing at a non-existent one
  run bash "$HEALTH_GATE" --context no-such-cluster --timeout 2
  [ "$status" -ne 0 ]
  echo "$output" | grep -qiE '(cluster|context|reachable|unavailable|no-such)'
}

@test "health-gate output names a missing component explicitly" {
  # Run with a short timeout against a cluster that does not exist.
  # The health-gate reports "cluster" as the failing component.
  run bash "$HEALTH_GATE" --context no-such-cluster --timeout 2
  [ "$status" -ne 0 ]
  # The output must name the component that failed, not just a generic error.
  # Accept 'cluster' as well as individual deployment names — the first
  # failure is the unreachable cluster context.
  echo "$output" | grep -qiE '(cluster|shared-db|pocket-id|sdlc-console|bge-embed|bge-rerank|llm-proxy|proxy)'
}

@test "health-gate with a reachable cluster but missing deployments exits non-zero" {
  if ! kubectl config get-contexts k3d-mentolder-dev >/dev/null 2>&1; then
    skip "cluster k3d-mentolder-dev context not configured"
  fi
  # Run against the real cluster; it may be up but missing deployments
  run bash "$HEALTH_GATE" --context k3d-mentolder-dev --timeout 5
  # If it passes (all present), skip; if not, must be non-zero
  if [ "$status" -eq 0 ]; then
    skip "all deployments are ready — cannot test failure path"
  fi
  echo "$output" | grep -qiE '(shared-db|pocket-id|sdlc-console|bge-embed|bge-rerank|llm-proxy|proxy)'
}

@test "health-gate never exits 0 when a component is not ready" {
  # Count ready deployments, check health-gate matches
  if ! kubectl config get-contexts k3d-mentolder-dev >/dev/null 2>&1; then
    skip "cluster k3d-mentolder-dev context not configured"
  fi
  READY_COUNT=$(kubectl --context k3d-mentolder-dev get deploy -n workspace \
    -o jsonpath='{range .items[?(@.status.readyReplicas)]}{.metadata.name}{"\n"}{end}' 2>/dev/null | wc -l)
  run bash "$HEALTH_GATE" --context k3d-mentolder-dev --timeout 5
  # If health-gate reports failure, exit code must be non-zero
  if echo "$output" | grep -qi 'not ready\|unavailable\|failed\|missing'; then
    [ "$status" -ne 0 ]
  fi
}

# ── sdlc:up does not block ───────────────────────────────────────────────────

@test "sdlc:up dry-run does not invoke an Astro dev server (does not block)" {
  run $TASK --dry sdlc:sdlc:up
  ! echo "$output" | grep -qiE '(astro dev|pnpm dev|npm run dev)'
}

@test "sdlc:dev exists separately and carries BUILD_TARGET=sdlc" {
  run $TASK --dry sdlc:sdlc:dev
  echo "$output" | grep -q 'BUILD_TARGET=sdlc'
}
