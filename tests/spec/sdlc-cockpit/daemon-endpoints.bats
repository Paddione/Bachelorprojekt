#!/usr/bin/env bats

# daemon-endpoints.bats — Daemon antwortet auf alle GET-Endpoints

setup() {
  DAEMON_PORT=${COCKPIT_DAEMON_PORT:-49152}
  BASE="http://127.0.0.1:${DAEMON_PORT}"
  if ! curl -s -m 2 "${BASE}/health" >/dev/null 2>&1; then
    skip "Daemon not running (no /health on ${BASE})"
  fi
}

@test "daemon health endpoint responds" {
  run curl -s -o /dev/null -w "%{http_code}" "${BASE}/health"
  [ "$output" = "200" ]
}

@test "GET /api/admin/cockpit/portfolio responds" {
  run curl -s "${BASE}/api/admin/cockpit/portfolio?brand=mentolder"
  [ "$?" -eq 0 ]
  echo "$output" | grep -q "fetchedAt"
}

@test "GET /api/admin/cluster/pods-list responds" {
  run curl -s "${BASE}/api/admin/cluster/pods-list?namespace=workspace"
  [ "$?" -eq 0 ]
  echo "$output" | grep -q "fetchedAt"
}

@test "GET /api/cockpit/agents responds" {
  run curl -s "${BASE}/api/cockpit/agents"
  [ "$?" -eq 0 ]
  echo "$output" | grep -q "fetchedAt"
}

@test "GET /api/cockpit/ci responds" {
  run curl -s "${BASE}/api/cockpit/ci"
  [ "$?" -eq 0 ]
  echo "$output" | grep -q "fetchedAt"
}

@test "GET /api/cockpit/models responds" {
  run curl -s "${BASE}/api/cockpit/models"
  [ "$?" -eq 0 ]
  echo "$output" | grep -q "fetchedAt"
}

@test "GET /api/admin/factory-control responds" {
  run curl -s "${BASE}/api/admin/factory-control"
  [ "$?" -eq 0 ]
  echo "$output" | grep -q "fetchedAt"
}
