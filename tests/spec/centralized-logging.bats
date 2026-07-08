#!/usr/bin/env bats
# tests/spec/centralized-logging.bats - Structural test for centralized error logging system

fail() {
  echo "$1" >&2
  return 1
}

@test "centralized-logging spec exists" {
  run bats --version
  [ $? -eq 0 ] || fail "BATS must be available"
}

@test "error-log-retention-cronjob manifest exists and is valid YAML" {
  [ -f k3d/error-log-retention-cronjob.yaml ] || fail "CronJob manifest missing"

  python3 -c "import yaml, sys; yaml.safe_load(open('k3d/error-log-retention-cronjob.yaml'))" \
    || fail "Invalid YAML in error-log-retention-cronjob.yaml"
}

@test "CronJob has correct kind and namespace" {
  local yaml
  yaml=$(cat k3d/error-log-retention-cronjob.yaml)

  echo "$yaml" | grep -qE "^kind: CronJob$" || fail "Not a CronJob resource"
  echo "$yaml" | grep -qE "^\s*namespace: workspace$" || fail "Wrong namespace (not 'workspace')"
}

@test "CronJob has daily schedule" {
  local yaml
  yaml=$(cat k3d/error-log-retention-cronjob.yaml)

  # Should have a daily schedule in cron format
  echo "$yaml" | grep -qE '^\s*schedule: "[0-9]+ [0-9]+ \* \* \*"$' || fail "Missing or invalid daily schedule"
}

@test "CronJob targets the correct in-cluster DNS name (not workspace namespace)" {
  local yaml
  yaml=$(cat k3d/error-log-retention-cronjob.yaml)

  # Should target website.website.svc.cluster.local, NOT *.workspace.*
  echo "$yaml" | grep -q "website.website.svc.cluster.local" || fail "Wrong DNS name (not 'website.website.svc.cluster.local')"
  if echo "$yaml" | grep -q "website\.workspace\."; then
    fail "Should not target workspace namespace"
  fi
}

@test "CronJob uses CRON_SECRET from secretKeyRef" {
  local yaml
  yaml=$(cat k3d/error-log-retention-cronjob.yaml)

  echo "$yaml" | grep -q "CRON_SECRET" || fail "Missing CRON_SECRET reference"
  echo "$yaml" | grep -qE "secretKeyRef:" || fail "Should use secretKeyRef for authentication"
}

@test "CronJob has hardened security context" {
  local yaml
  yaml=$(cat k3d/error-log-retention-cronjob.yaml)

  # Pod-level security context
  echo "$yaml" | grep -q "runAsNonRoot: true" || fail "Missing runAsNonRoot in pod spec"
  echo "$yaml" | grep -q "seccompProfile:" || fail "Missing seccompProfile"

  # Container-level security context
  echo "$yaml" | grep -A50 "containers:" | grep -q "allowPrivilegeEscalation: false" || fail "Missing allowPrivilegeEscalation: false"
}

@test "CronJob uses curlimages/curl with digest" {
  local yaml
  yaml=$(cat k3d/error-log-retention-cronjob.yaml)

  echo "$yaml" | grep -qE "^\s*image:" || fail "Missing image specification"
  # Should reference a specific digest (not tag:latest)
  echo "$yaml" | grep "curlimages/curl" | grep -q "@" || fail "Image should use digest, not tag"
}
