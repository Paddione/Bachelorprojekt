#!/usr/bin/env bats
# SSOT: openspec/changes/g-dep01-npm-vuln/
# G-DEP01: npm Vulnerability Fix — pnpm audit clean gate.
# Erzwingt 0 Vulnerabilities in website/pnpm-lock.yaml via pnpm.overrides.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  WEBSITE_DIR="${REPO_ROOT}/website"
}

@test "G-DEP01: pnpm audit reports zero vulnerabilities" {
  run bash -c "cd '${WEBSITE_DIR}' && pnpm audit --json"
  # Parse total vulnerability count from JSON output
  total="$(echo "${output}" | python3 -c "
import sys, json
data = json.load(sys.stdin)
meta = data.get('metadata', {})
vulns = meta.get('vulnerabilities', {})
print(vulns.get('total', -1))
" 2>/dev/null || echo "-1")"
  [ "${total}" -eq 0 ]
}

@test "G-DEP01: js-yaml resolved version is not vulnerable (>=4.1.2)" {
  run bash -c "cd '${WEBSITE_DIR}' && pnpm why js-yaml 2>&1"
  # Version 4.1.1 is vulnerable; any 4.1.2+ is safe
  echo "pnpm why js-yaml output: ${output}"
  # Check that 4.1.1 is NOT in the resolved versions (grep fixed-string on first line)
  ! echo "${output}" | grep -qF 'js-yaml@4.1.1'
}

@test "G-DEP01: @babel/core resolved version is not vulnerable (>=7.29.1)" {
  run bash -c "cd '${WEBSITE_DIR}' && pnpm why @babel/core 2>&1"
  echo "pnpm why @babel/core output: ${output}"
  # 7.29.0 is vulnerable; 7.29.1+ is safe
  ! echo "${output}" | grep -qF '@babel/core@7.29.0'
}
