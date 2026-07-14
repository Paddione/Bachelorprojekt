#!/usr/bin/env bats
# FA-SF-63 — deterministic Factory scout (scout.sh) contract + pipeline integrity.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  SCOUT="${REPO_ROOT}/scripts/factory/scout.sh"
  FIXTURE="${REPO_ROOT}/tests/local/fixtures/scout-repo"
  PIPELINE="${REPO_ROOT}/scripts/factory/pipeline.js"
}

@test "scout.sh with no args prints usage and exits non-zero" {
  run bash "$SCOUT"
  [ "$status" -ne 0 ]
  [[ "$output" == *"Usage:"* ]]
}

@test "scout.sh --help exits 0" {
  run bash "$SCOUT" --help
  [ "$status" -eq 0 ]
}

@test "scout.sh emits valid JSON for a real feature" {
  run bash "$SCOUT" --ticket-id T000001 \
    --title "add booking confirmation email" \
    --slug "add-booking-confirmation-email" \
    --description "send email after booking" \
    --repo "$REPO_ROOT"
  [ "$status" -eq 0 ]
  echo "$output" | jq -e . >/dev/null
}

@test "scout.sh touched_files is always an array (even with zero hits)" {
  run bash "$SCOUT" --title "zzzxqq fffvvv" --slug "" --repo "$REPO_ROOT"
  [ "$status" -eq 0 ]
  result="$(echo "$output" | jq -e '.touched_files | type == "array"')"
  [ "$result" = "true" ]
}

@test "scout.sh complexity is one of simple|medium|complex" {
  out="$(bash "$SCOUT" --title "add booking email" --slug "add-booking-email" --repo "$REPO_ROOT")"
  c="$(echo "$out" | jq -r '.complexity')"
  [[ "$c" == "simple" || "$c" == "medium" || "$c" == "complex" ]]
}

@test "scout.sh empty slug does not crash, falls back to medium when no hits" {
  run env SCOUT_LLM_ENABLED=false bash "$SCOUT" --title "zzzxqq fffvvv" --slug "" --repo "$REPO_ROOT"
  [ "$status" -eq 0 ]
  c="$(echo "$output" | jq -r '.complexity')"
  [ "$c" = "medium" ]
  slots="$(echo "$output" | jq -r '.estimated_slots')"
  [ "$slots" = "2" ]
}

@test "scout.sh risk_areas contains k8s-manifests when a k3d path is discovered" {
  # Fixture repo has k3d/booking-config.yaml; "config" triggers infra Strategy C.
  out="$(bash "$SCOUT" --title "booking config" --slug "booking-config" --repo "$FIXTURE")"
  echo "$out" | jq -e '.touched_files | any(. | test("k3d/booking-config"))' >/dev/null
  echo "$out" | jq -e '.risk_areas | index("k8s-manifests") != null' >/dev/null
}

@test "scout.sh touched_files are absolute paths" {
  out="$(bash "$SCOUT" --title "booking config" --slug "booking-config" --repo "$FIXTURE")"
  # Every entry must start with '/'.
  echo "$out" | jq -e '.touched_files | all(startswith("/"))' >/dev/null
}

@test "scout.sh similar_tickets is an array" {
  out="$(bash "$SCOUT" --title "booking" --slug "booking" --repo "$FIXTURE")"
  echo "$out" | jq -e '.similar_tickets | type == "array"' >/dev/null
}

@test "scout.sh estimated_slots is an integer >= 1" {
  out="$(bash "$SCOUT" --title "add booking email" --slug "add-booking-email" --repo "$REPO_ROOT")"
  slots="$(echo "$out" | jq -r '.estimated_slots')"
  echo "$out" | jq -e '.estimated_slots | type == "number"' >/dev/null
  [ "$slots" -ge 1 ]
}

@test "pipeline.js still passes node --check" {
  run node --check "$PIPELINE"
  [ "$status" -eq 0 ]
}

@test "pipeline.js invokes scout.sh via execFileSync (no LLM scout agent call)" {
  # The deterministic swap must reference scout.sh and must NOT keep a
  # label:'scout' agent() call for discovery.
  grep -q "scout.sh" "$PIPELINE"
  # Assert the old LLM scout prompt phrase is gone.
  ! grep -q "Scout the feature" "$PIPELINE"
}

@test "scout.sh with SCOUT_LLM_ENABLED=false runs deterministic path only (no crash, valid JSON)" {
  run env SCOUT_LLM_ENABLED=false bash "$SCOUT" --title "zzzxqq fffvvv" --slug "" --repo "$REPO_ROOT"
  [ "$status" -eq 0 ]
  echo "$output" | jq -e . >/dev/null
  c="$(echo "$output" | jq -r '.complexity')"
  [ "$c" = "medium" ]
}
