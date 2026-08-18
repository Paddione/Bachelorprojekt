#!/usr/bin/env bats
#
# T012446 — Portable PR-Gates nutzen GitHub-hosted Kapazitaet; nur Jobs mit
# belegter lokaler Abhaengigkeit duerfen eigene Hardware belegen.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  cd "$REPO" || return 1
}

_ci_portable_jobs() {
  printf '%s\n' \
    test-bats \
    test-manifests \
    test-factory-openspec \
    test-factory-shard \
    test-factory \
    security-scan \
    brett-typescript \
    vitest-website \
    lighthouse \
    commit-lint
}

_portable_workflow_jobs() {
  printf '%s\t%s\n' \
    .github/workflows/ai-review.yml ai-review \
    .github/workflows/auto-enable-automerge.yml enable-automerge \
    .github/workflows/e2e-pr.yml e2e-pr \
    .github/workflows/pr-auto-title.yml auto-title
}

@test "T012446: alle portablen Kern-CI-Jobs laufen auf ubuntu-latest" {
  local job runner bad=0
  while IFS= read -r job; do
    runner="$(yq -r ".jobs.\"$job\".\"runs-on\" | tostring" .github/workflows/ci.yml)"
    if [ "$runner" != "ubuntu-latest" ]; then
      echo "FALSCHER RUNNER: ci.yml job '$job' -> $runner (erwartet ubuntu-latest)" >&2
      bad=$((bad + 1))
    fi
  done < <(_ci_portable_jobs)
  [ "$bad" -eq 0 ]
}

@test "T012446: portable PR-Hilfsworkflows laufen auf ubuntu-latest" {
  local file job runner bad=0
  while IFS=$'\t' read -r file job; do
    runner="$(yq -r ".jobs.\"$job\".\"runs-on\" | tostring" "$file")"
    if [ "$runner" != "ubuntu-latest" ]; then
      echo "FALSCHER RUNNER: $file job '$job' -> $runner (erwartet ubuntu-latest)" >&2
      bad=$((bad + 1))
    fi
  done < <(_portable_workflow_jobs)
  [ "$bad" -eq 0 ]
}

@test "T012446: portable Kern-CI ist fuer Fork-Validierung nicht global gesperrt" {
  local job cond bad=0
  while IFS= read -r job; do
    cond="$(yq -r ".jobs.\"$job\".if // \"\"" .github/workflows/ci.yml)"
    if [[ "$cond" == *github.repository* ]]; then
      echo "UNNOETIGER FORK-GUARD: ci.yml job '$job' ist GitHub-hosted, aber sperrt Forks" >&2
      bad=$((bad + 1))
    fi
  done < <(_ci_portable_jobs)
  [ "$bad" -eq 0 ]
}

@test "T012446: secret- oder write-abhaengige PR-Hilfsjobs behalten ihren Trust-Guard" {
  local file job cond bad=0
  while IFS=$'\t' read -r file job; do
    cond="$(yq -r ".jobs.\"$job\".if // \"\"" "$file")"
    if [[ "$cond" != *github.repository* ]]; then
      echo "FEHLENDER TRUST-GUARD: $file job '$job'" >&2
      bad=$((bad + 1))
    fi
  done < <(_portable_workflow_jobs)
  [ "$bad" -eq 0 ]
}

@test "T012446: lokale LLM-Jobs behalten self-hosted plus fleet-gpu" {
  local file job runner bad=0
  while IFS=$'\t' read -r file job; do
    runner="$(yq -r ".jobs.\"$job\".\"runs-on\" | tostring" "$file")"
    if [[ "$runner" != *self-hosted* || "$runner" != *fleet-gpu* ]]; then
      echo "LOKALE CAPABILITY VERLOREN: $file job '$job' -> $runner" >&2
      bad=$((bad + 1))
    fi
  done <<'EOF'
.github/workflows/opencode.yml	opencode
.github/workflows/arbitration.yml	arbitrate
EOF
  [ "$bad" -eq 0 ]
}

@test "T012446: Required-Check-Namen bleiben stabil" {
  [ "$(yq -r '.jobs.test-bats.name' .github/workflows/ci.yml)" = "BATS Unit + Quality Gates" ]
  [ "$(yq -r '.jobs.test-manifests.name' .github/workflows/ci.yml)" = "Manifest Validation" ]
  [ "$(yq -r '.jobs.test-factory.name' .github/workflows/ci.yml)" = "Factory + OpenSpec + Guards" ]
  [ "$(yq -r '.jobs.vitest-website.name' .github/workflows/ci.yml)" = "Vitest (website)" ]
  [ "$(yq -r '.jobs.commit-lint.name' .github/workflows/ci.yml)" = "Conventional Commits" ]
  [ "$(yq -r '.jobs.e2e-pr.name' .github/workflows/e2e-pr.yml)" = "E2E PR" ]
}
