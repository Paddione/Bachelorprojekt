#!/usr/bin/env bats
# tests/spec/wsl-exit-docs.bats
# SSOT: openspec/changes/wsl-exit-adr007/specs/sdlc-isolation.md [T016436]

setup() {
  load 'test_helper.bash'
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
}

@test "ADR-007 exists and supersedes ADR-006 in both directions" {
  local adr7="${REPO_ROOT}/docs/adr/ADR-007-wsl-exit-fleet-native-factory.md"
  local adr6="${REPO_ROOT}/docs/adr/ADR-006-sdlc-isolation-dev-host.md"
  [ -f "$adr7" ]
  grep -qi "supersedes" "$adr7"
  grep -q "ADR-006" "$adr7"
  grep -Eqi "Superseded by.*ADR-007" "$adr6"
}

@test ".gitattributes forces lf for linux-interpreted sources" {
  local ga="${REPO_ROOT}/.gitattributes"
  [ -f "$ga" ]
  for suffix in sh yaml yml bats mjs; do
    grep -qE "\*\.${suffix}[[:space:]]+text eol=lf" "$ga" ||
      fail "missing eol=lf rule for *.${suffix}"
  done
}

@test "windows-dev-setup documents the three P0 spikes as checklists" {
  local doc="${REPO_ROOT}/docs/windows-dev-setup.md"
  [ -f "$doc" ]
  grep -qi "opencode-Windows-Viability" "$doc"
  grep -qi "NTFS-Clone" "$doc"
  grep -qi "Fleet.*Windows:1919\|Windows:1919.*wg/NAT" "$doc"
  [ "$(grep -c '\- \[ \]' "$doc")" -ge 12 ]
}

@test "WSL-BOOTSTRAP contains shutdown checklist with wsl --shutdown final" {
  local doc="${REPO_ROOT}/docs/WSL-BOOTSTRAP.md"
  grep -q "Shutdown-Checkliste" "$doc"
  grep -q "gitlab-registry-cache" "$doc"
  grep -q "wsl --shutdown" "$doc"
}
