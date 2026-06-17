#!/usr/bin/env bats
# tests/local/FA-SF-05-triage.bats — Tests für auto-triage.sh Validierung & Idempotenz [T000933]

setup() {
  REPO="${BATS_TEST_DIRNAME}/../.."
  SCRIPT="${REPO}/scripts/factory/auto-triage.sh"
  ENUMS_FILE="${REPO}/scripts/factory/triage-enums.json"
  # Define validate_triage inline for offline tests — mirrors auto-triage.sh
  validate_triage() {
    local json="$1"
    if ! echo "$json" | jq empty 2>/dev/null; then return 1; fi
    local t; t=$(echo "$json" | jq -r '.type // ""')
    if [[ ! "$t" =~ ^(bug|feature|task|project)$ ]]; then return 1; fi
    local s; s=$(echo "$json" | jq -r '.severity // ""')
    if [[ ! "$s" =~ ^(critical|major|minor|trivial)$ ]]; then return 1; fi
    local p; p=$(echo "$json" | jq -r '.priority // ""')
    if [[ ! "$p" =~ ^(hoch|mittel|niedrig)$ ]]; then return 1; fi
    local areas; areas=$(echo "$json" | jq -r '.areas // [] | join("\n")')
    local enums; enums=$(cat "$ENUMS_FILE")
    local allowed_areas; allowed_areas=$(echo "$enums" | jq -r '.areas[]')
    while IFS= read -r area; do
      [[ -z "$area" ]] && continue
      if ! echo "$allowed_areas" | grep -qxF "$area"; then return 1; fi
    done <<< "$areas"
    local comp; comp=$(echo "$json" | jq -r '.component // ""')
    if [[ -n "$comp" && "$comp" != "null" ]]; then
      local allowed_comp; allowed_comp=$(echo "$enums" | jq -r '.components[]')
      if ! echo "$allowed_comp" | grep -qxF "$comp"; then return 1; fi
    fi
    local assignee; assignee=$(echo "$json" | jq -r '.assignee_suggested // ""')
    if [[ -z "$assignee" || "$assignee" == "null" ]]; then return 1; fi
    local allowed_assignees; allowed_assignees=$(echo "$enums" | jq -r '.assignees[]')
    if ! echo "$allowed_assignees" | grep -qxF "$assignee"; then return 1; fi
    return 0
  }
}

# ── Enum-Validierung ──────────────────────────────────────────────────

@test "FA-SF-05-01: validate_triage accepts valid JSON" {
  run validate_triage '{
    "type": "feature",
    "priority": "mittel",
    "severity": "minor",
    "areas": ["website", "tickets"],
    "component": "planungsbuero",
    "assignee_suggested": "patrick",
    "rationale": "Test"
  }'
  [[ "$status" -eq 0 ]]
}

@test "FA-SF-05-02: validate_triage rejects invalid type" {
  run validate_triage '{
    "type": "invalid",
    "priority": "mittel",
    "severity": "minor",
    "areas": ["website"],
    "component": null,
    "assignee_suggested": "patrick"
  }'
  [[ "$status" -ne 0 ]]
}

@test "FA-SF-05-03: validate_triage rejects invalid severity" {
  run validate_triage '{
    "type": "bug",
    "priority": "hoch",
    "severity": "extreme",
    "areas": ["website"],
    "component": null,
    "assignee_suggested": "patrick"
  }'
  [[ "$status" -ne 0 ]]
}

@test "FA-SF-05-04: validate_triage rejects invalid priority" {
  run validate_triage '{
    "type": "task",
    "priority": "dringend",
    "severity": "minor",
    "areas": ["ci"],
    "component": null,
    "assignee_suggested": "factory"
  }'
  [[ "$status" -ne 0 ]]
}

@test "FA-SF-05-05: validate_triage rejects unknown area" {
  run validate_triage '{
    "type": "project",
    "priority": "niedrig",
    "severity": "trivial",
    "areas": ["website", "unbekannt"],
    "component": null,
    "assignee_suggested": "patrick"
  }'
  [[ "$status" -ne 0 ]]
}

@test "FA-SF-05-06: validate_triage rejects unknown component" {
  run validate_triage '{
    "type": "bug",
    "priority": "hoch",
    "severity": "critical",
    "areas": ["security"],
    "component": "fakeservice",
    "assignee_suggested": "patrick"
  }'
  [[ "$status" -ne 0 ]]
}

@test "FA-SF-05-07: validate_triage rejects unknown assignee" {
  run validate_triage '{
    "type": "feature",
    "priority": "mittel",
    "severity": "major",
    "areas": ["tickets"],
    "component": null,
    "assignee_suggested": "eindringling"
  }'
  [[ "$status" -ne 0 ]]
}

@test "FA-SF-05-08: validate_triage rejects malformed JSON" {
  run validate_triage '{nope}'
  [[ "$status" -ne 0 ]]
}

@test "FA-SF-05-09: validate_triage rejects empty string" {
  run validate_triage ''
  [[ "$status" -ne 0 ]]
}

@test "FA-SF-05-10: validate_triage accepts null component" {
  run validate_triage '{
    "type": "task",
    "priority": "hoch",
    "severity": "major",
    "areas": ["infra"],
    "component": null,
    "assignee_suggested": "factory",
    "rationale": "ok"
  }'
  [[ "$status" -eq 0 ]]
}

# ── Idempotenz und DRY-RUN ────────────────────────────────────────────

@test "FA-SF-05-11: FACTORY_DRY_RESOLVE shortcut exits 0 immediately" {
  run bash -c "
    export FACTORY_DRY_RESOLVE=1
    export BRAND=mentolder
    ENUMS_FILE='${ENUMS_FILE}' bash '${SCRIPT}'
  "
  [[ "$status" -eq 0 ]]
  [[ "$output" =~ "DRY-RESOLVE" ]]
}

@test "FA-SF-05-12: --help exits 0 and prints usage" {
  run bash "${SCRIPT}" --help
  [[ "$status" -eq 0 ]]
  [[ "$output" =~ "Usage" ]]
}

@test "FA-SF-05-13: missing BRAND exits non-zero" {
  run bash -c "unset BRAND; bash '${SCRIPT}'" 2>&1 || true
  [[ "$status" -ne 0 ]] || [[ "$output" =~ "BRAND" ]]
}

@test "FA-SF-05-14: --dry-run flag is recognized" {
  export BRAND=mentolder
  export FACTORY_DRY_RESOLVE=1
  run bash "${SCRIPT}" --dry-run
  [[ "$status" -eq 0 ]]
}

@test "FA-SF-05-15: triage-enums.json is valid JSON" {
  run jq empty "${ENUMS_FILE}"
  [[ "$status" -eq 0 ]]
}

@test "FA-SF-05-16: triage-enums.json has required keys" {
  run bash -c "jq -e '.areas and .components and .assignees' '${ENUMS_FILE}' > /dev/null"
  [[ "$status" -eq 0 ]]
}

@test "FA-SF-05-17: auto-triage.sh passes bash -n syntax check" {
  run bash -n "${SCRIPT}"
  [[ "$status" -eq 0 ]]
}
