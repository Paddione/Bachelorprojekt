#!/usr/bin/env bats

# freshness-timestamp.bats — D12: Alle Antworten enthalten fetchedAt

setup() {
  DAEMON_PORT=${COCKPIT_DAEMON_PORT:-49152}
  BASE="http://127.0.0.1:${DAEMON_PORT}"
  if ! curl -s -m 2 "${BASE}/health" >/dev/null 2>&1; then
    skip "Daemon not running (no /health on ${BASE})"
  fi
}

@test "D12: /health has fetchedAt" {
  run curl -s "${BASE}/health"
  echo "$output" | grep -q "fetchedAt"
}

@test "D12: /api/admin/cockpit/portfolio has fetchedAt" {
  run curl -s "${BASE}/api/admin/cockpit/portfolio?brand=mentolder"
  echo "$output" | grep -q '"fetchedAt"'
}

@test "D12: /api/admin/cluster/pods-list has fetchedAt" {
  run curl -s "${BASE}/api/admin/cluster/pods-list?namespace=workspace"
  echo "$output" | grep -q '"fetchedAt"'
}

@test "D12: /api/cockpit/agents has fetchedAt" {
  run curl -s "${BASE}/api/cockpit/agents"
  echo "$output" | grep -q '"fetchedAt"'
}

@test "D12: fetchedAt is valid ISO 8601" {
  run curl -s "${BASE}/health"
  local ts=$(echo "$output" | grep -oP '"fetchedAt":"[^"]+"' | head -1 | cut -d'"' -f4)
  # ISO 8601: 2026-07-28T20:30:00Z or 2026-07-28T20:30:00.000Z
  echo "$ts" | grep -qP '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}'
}

@test "D12: fetchedAt is recent (within last 60 seconds)" {
  run curl -s "${BASE}/health"
  local ts=$(echo "$output" | grep -oP '"fetchedAt":"[^"]+"' | head -1 | cut -d'"' -f4)
  local epoch=$(date -d "$ts" +%s 2>/dev/null || echo 0)
  local now=$(date +%s)
  local diff=$((now - epoch))
  [ "$diff" -lt 60 ]
}
