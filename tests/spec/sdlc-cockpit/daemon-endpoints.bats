#!/usr/bin/env bats

# daemon-endpoints.bats — Daemon antwortet auf alle GET-Endpoints

load daemon-helper

setup() {
  require_daemon || return 1
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
