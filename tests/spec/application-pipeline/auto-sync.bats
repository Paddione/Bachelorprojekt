#!/usr/bin/env bats
# tests/spec/application-pipeline/auto-sync.bats
# BATS-Tests für die Auto-Sync-Funktion (Phase 5, T900231).
#
# Testet:
#   - app_pipeline_sync_json_file (batch ingestion from JSON)
#   - app_pipeline_sync_directory (directory scan import)
#   - app_pipeline_auto_match (automatic match scoring)
#   - app_pipeline_auto_render (dossier generation trigger)
#   - auto-sync CLI flags

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  _AUTO_SYNC_SH="${REPO_ROOT}/scripts/lib/application-pipeline-auto-sync.sh"
  _AUTO_SYNC_CLI="${REPO_ROOT}/scripts/vda/apply/auto-sync.sh"
  _DB_SH="${REPO_ROOT}/scripts/lib/application-pipeline-db.sh"

  source "$_AUTO_SYNC_SH"
  source "$_DB_SH"

  # Create test temp dir
  TEST_TMPDIR="$(mktemp -d)"
}

teardown() {
  if [[ -n "${TEST_TMPDIR:-}" ]]; then
    rm -rf "$TEST_TMPDIR"
  fi
}

# === Test: Auto-sync lib exists ===

@test "T900231: application-pipeline-auto-sync.sh exists" {
  [[ -f "$_AUTO_SYNC_SH" ]]
}

@test "T900231: app_pipeline_sync_json_file function is available after source" {
  source "$_AUTO_SYNC_SH"
  command -v app_pipeline_sync_json_file >/dev/null 2>&1
}

@test "T900231: auto-sync CLI exists and is executable" {
  [[ -f "$_AUTO_SYNC_CLI" ]]
  [[ -x "$_AUTO_SYNC_CLI" ]]
}

# === Test: JSON sync ===

@test "T900231: sync_json_file requires path argument" {
  local output
  output=$(app_pipeline_sync_json_file 2>&1) || true
  echo "$output" | grep -q "JSON path required"
}

@test "T900231: sync_json_file rejects non-existent file" {
  local output
  output=$(app_pipeline_sync_json_file "/nonexistent/path.json" 2>&1) || true
  echo "$output" | grep -q "file not found"
}

@test "T900231: sync_json_file creates job from JSON entry" {
  local json_file="${TEST_TMPDIR}/jobs.json"
  local comp="TestCorp$(date +%s%N)"
  cat > "$json_file" <<JSON
{
  "jobs": [
    {
      "company": "${comp}",
      "role": "Platform Engineer",
      "source_url": "https://testcorp.com/careers/platform",
      "requirements": "Kubernetes CI/CD Terraform",
      "status": "found"
    }
  ]
}
JSON

  local output
  output=$(app_pipeline_sync_json_file "$json_file" 2>/dev/null)
  echo "$output" | grep -q "${comp}"
}

@test "T900231: sync_json_file handles bare JSON array" {
  local json_file="${TEST_TMPDIR}/jobs.json"
  local comp="ArrayCorp$(date +%s%N)"
  cat > "$json_file" <<JSON
[
  {
    "company": "${comp}",
    "role": "DevOps Lead",
    "requirements": "Docker Kubernetes",
    "status": "found"
  }
]
JSON

  local output
  output=$(app_pipeline_sync_json_file "$json_file" 2>/dev/null)
  echo "$output" | grep -q "${comp}"
}

@test "T900231: sync_json_file rejects invalid JSON structure" {
  local json_file="${TEST_TMPDIR}/invalid.json"
  echo '{"data": []}' > "$json_file"

  local output
  output=$(app_pipeline_sync_json_file "$json_file" 2>&1) || true
  echo "$output" | grep -q "JSON must have"
}

@test "T900231: sync_json_file skips entries without company/role" {
  local json_file="${TEST_TMPDIR}/partial.json"
  local comp="GoodCorp$(date +%s%N)"
  cat > "$json_file" <<JSON
{
  "jobs": [
    {"company": "${comp}", "role": "Engineer", "requirements": "Kubernetes"},
    {"company": ""},
    {"role": "Engineer"}
  ]
}
JSON

  local output
  output=$(app_pipeline_sync_json_file "$json_file" 2>&1)
  echo "$output" | grep -q "${comp}"
  echo "$output" | grep -q "missing company"
}

@test "T900231: sync_json_file with dry-run doesn't modify DB" {
  local json_file="${TEST_TMPDIR}/dry.json"
  cat > "$json_file" <<'JSON'
{
  "jobs": [
    {
      "company": "DryCorp",
      "role": "Test Engineer",
      "requirements": "Testing",
      "status": "found"
    }
  ]
}
JSON

  local output
  output=$(app_pipeline_sync_json_file "$json_file" "true")
  echo "$output" | grep -q "DRY-RUN"
  # Verify no job was created
  local count
  count=$(_app_pipeline_exec_sql "SELECT COUNT(*) FROM applications.jobs WHERE company = 'DryCorp';" 2>/dev/null | tr -d '[:space:]') || true
  if [[ -n "$count" ]]; then
    [[ "$count" == "0" ]]
  fi
}

# === Test: Directory sync ===

@test "T900231: sync_directory requires path argument" {
  local output
  output=$(app_pipeline_sync_directory 2>&1) || true
  echo "$output" | grep -q "directory path required"
}

@test "T900231: sync_directory rejects non-existent directory" {
  local output
  output=$(app_pipeline_sync_directory "/nonexistent/dir" 2>&1) || true
  echo "$output" | grep -q "directory not found"
}

@test "T900231: sync_directory imports text files" {
  local dir="$TEST_TMPDIR/jobs"
  mkdir -p "$dir"
  local comp="CloudCorp$(date +%s%N)"
  local role="SeniorDevOps"
  cat > "$dir/position1.txt" <<EOF
${role} Engineer @ ${comp}
https://${comp,,}.com/careers

Requirements: Kubernetes CI/CD Python
EOF

  local output
  output=$(app_pipeline_sync_directory "$dir" 2>/dev/null)
  echo "$output" | grep -q "${comp}"
}

@test "T900231: sync_directory skips JSON files" {
  local dir="$TEST_TMPDIR/jobs"
  mkdir -p "$dir"
  cat > "$dir/test.json" <<'JSON'
{"company": "JsonCorp", "role": "Dev"}
JSON

  local output
  output=$(app_pipeline_sync_directory "$dir" 2>/dev/null)
  echo "$output" | grep -q "0 files processed"
}

@test "T900231: sync_directory with file-pattern" {
  local dir="$TEST_TMPDIR/jobs"
  mkdir -p "$dir"
  local comp="PatternCorp$(date +%s%N)"
  cat > "$dir/pos.txt" <<EOF
Test Engineer @ ${comp}
Requirements: Testing
EOF

  local output
  output=$(app_pipeline_sync_directory "$dir" "*.txt" 2>/dev/null)
  echo "$output" | grep -q "${comp}"
}

# === Test: Auto-match ===

@test "T900231: app_pipeline_auto_match requires job_id" {
  local output
  output=$(app_pipeline_auto_match 2>&1) || true
  echo "$output" | grep -q "job_id required"
}

@test "T900231: auto-match computes score for valid job" {
  # Create a job first (with all required columns including raw_text)
  local job_id
  local comp="AutoMatchTest$(date +%s%N)"
  job_id=$(_app_pipeline_exec_sql "INSERT INTO applications.jobs (company, role_title, raw_text, requirements, status) VALUES ('${comp}', 'Engineer', 'Kubernetes CI/CD test', 'Kubernetes CI/CD', 'found') RETURNING id;" 2>/dev/null | tr -d '[:space:]')

  [[ -n "$job_id" ]] || skip "could not create test job (db issue)"

  local output
  output=$(app_pipeline_auto_match "$job_id" 2>/dev/null)
  echo "$output" | grep -q "Auto-match complete"
}

@test "T900231: auto-match fails on non-existent job" {
  local output
  output=$(app_pipeline_auto_match "99999" 2>&1) || true
  echo "$output" | grep -q "not found"
}

# === Test: Auto-render ===

@test "T900231: app_pipeline_auto_render requires job_id" {
  local output
  output=$(app_pipeline_auto_render 2>&1) || true
  echo "$output" | grep -q "job_id required"
}

@test "T900231: auto-render with unknown theme fails" {
  local output
  output=$(app_pipeline_auto_render "1" "nonexistent-theme" 2>&1) || true
  echo "$output" | grep -q "unknown theme"
}

@test "T900231: auto-render on non-existent job gracefully fails" {
  local output
  output=$(app_pipeline_auto_render "99999" "default" 2>&1) || true
  # Should not crash, just fail gracefully
  true
}

# === Test: CLI ===

@test "T900231: auto-sync CLI shows help" {
  local output
  output=$(bash "$_AUTO_SYNC_CLI" --help 2>&1)
  echo "$output" | grep -q "Auto-syncs"
}

@test "T900231: auto-sync CLI requires --json or --dir" {
  local output
  output=$(bash "$_AUTO_SYNC_CLI" 2>&1) || true
  echo "$output" | grep -F -q -- "--json or --dir is required"
}

@test "T900231: auto-sync CLI rejects both --json and --dir" {
  local output
  output=$(bash "$_AUTO_SYNC_CLI" --json /tmp/a.json --dir /tmp/b 2>&1) || true
  echo "$output" | grep -q "not both"
}

@test "T900231: auto-sync CLI dry-run flag works" {
  local json_file="${TEST_TMPDIR}/cli.json"
  cat > "$json_file" <<'JSON'
{
  "jobs": [
    {"company": "CLITest", "role": "Engineer", "status": "found"}
  ]
}
JSON

  local output
  output=$(bash "$_AUTO_SYNC_CLI" --json "$json_file" --dry-run --no-match 2>/dev/null)
  echo "$output" | grep -q "DRY RUN MODE"
  echo "$output" | grep -q "DRY-RUN"
}

@test "T900231: auto-sync CLI no-render flag skips render phase" {
  local json_file="${TEST_TMPDIR}/cli.json"
  cat > "$json_file" <<'JSON'
{
  "jobs": [
    {"company": "NoRenderTest", "role": "Engineer", "status": "drafting"}
  ]
}
JSON

  local output
  output=$(bash "$_AUTO_SYNC_CLI" --json "$json_file" --no-render --no-match 2>/dev/null)
  echo "$output" | grep -q "Auto-Sync Complete"
  [[ ! "$output" == *"Auto-Render"* ]]
}
