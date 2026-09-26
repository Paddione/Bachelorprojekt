#!/usr/bin/env bats
# tests/spec/openspec-workflow/orphan-detect.bats
# SSOT: openspec/changes/openspec-orphan-auto-dispatch/specs/openspec-workflow.md
#
# `gh` läuft als Stub mit Fixture-Antworten (kein Netz, kein Token). Vier Slugs:
# old-merged (verwaist → select), young-merged (skip: too young),
# old-openpr (skip: open pull request), nofix (skip: no merged fix pull request).
# Skip-Gründe gehen nach stderr; stdout trägt nur selektierte Slugs.

bats_require_minimum_version 1.5.0

SCRIPT_REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
DETECT="${SCRIPT_REPO_ROOT}/scripts/openspec-orphan-detect.sh"

setup() {
  STUBDIR="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$STUBDIR"
  cat > "$STUBDIR/gh" <<'GH_STUB'
#!/usr/bin/env bash
# Fixture-gesteuerter gh-Stub: antwortet anhand der argv-Muster.
args="$*"
young_date=$(python3 -c 'import time; print(time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - 3600)))')
old_date="2020-05-01T00:00:00Z"
b64() { printf '%s' "$1" | base64 | tr -d '\n'; }
case "$args" in
  *"contents/openspec/changes?ref=main"*)
    printf '[{"type":"dir","name":"archive"},{"type":"dir","name":"old-merged"},{"type":"dir","name":"young-merged"},{"type":"dir","name":"old-openpr"},{"type":"dir","name":"nofix"},{"type":"file","name":"README.md"}]\n'
    ;;
  *"changes/old-merged/.ticket"*) printf '{"content":"%s"}\n' "$(b64 'T111111')" ;;
  *"changes/young-merged/.ticket"*) printf '{"content":"%s"}\n' "$(b64 'T222222')" ;;
  *"changes/old-openpr/.ticket"*) printf '{"content":"%s"}\n' "$(b64 'T333333')" ;;
  *"changes/nofix/.ticket"*) printf '{"content":"%s"}\n' "$(b64 'T444444')" ;;
  *"commits?sha=main"*"old-merged"*|*"commits?sha=main"*"old-openpr"*|*"commits?sha=main"*"nofix"*)
    printf '[{"commit":{"committer":{"date":"%s"}}}]\n' "$old_date" ;;
  *"commits?sha=main"*"young-merged"*)
    printf '[{"commit":{"committer":{"date":"%s"}}}]\n' "$young_date" ;;
  *"pr list"*"--state merged"*"T111111"*) printf '[{"title":"feat(x): done [T111111]"}]\n' ;;
  *"pr list"*"--state merged"*"T222222"*) printf '[{"title":"feat(x): done [T222222]"}]\n' ;;
  *"pr list"*"--state merged"*"T333333"*) printf '[{"title":"feat(x): done [T333333]"}]\n' ;;
  *"pr list"*"--state merged"*) printf '[]\n' ;;
  *"pr list"*"--state open"*"old-openpr"*) printf '[{"title":"chore(plans): archive old-openpr"}]\n' ;;
  *"pr list"*"--state open"*) printf '[]\n' ;;
  *) printf '[]\n' ;;
esac
GH_STUB
  chmod +x "$STUBDIR/gh"
}

@test "orphaned slug is selected, others skipped with reasons" {
  run --separate-stderr env PATH="$STUBDIR:$PATH" bash "$DETECT" --min-age-hours 24
  [ "$status" -eq 0 ]
  [ "$output" = "old-merged" ]
  [[ "$stderr" == *"select old-merged (T111111)"* ]]
}

@test "slug without merged fix pull request is skipped" {
  run --separate-stderr env PATH="$STUBDIR:$PATH" bash "$DETECT" --min-age-hours 24
  [ "$status" -eq 0 ]
  [[ "$output" != *"nofix"* ]]
  [[ "$stderr" == *"skip nofix: no merged fix pull request"* ]]
}

@test "young slug is skipped inside grace period" {
  run --separate-stderr env PATH="$STUBDIR:$PATH" bash "$DETECT" --min-age-hours 24
  [ "$status" -eq 0 ]
  [[ "$output" != *"young-merged"* ]]
  [[ "$stderr" == *"skip young-merged: too young"* ]]
}

@test "slug with open pull request is skipped" {
  run --separate-stderr env PATH="$STUBDIR:$PATH" bash "$DETECT" --min-age-hours 24
  [ "$status" -eq 0 ]
  [[ "$output" != *"old-openpr"* ]]
  [[ "$stderr" == *"skip old-openpr: open pull request"* ]]
}

@test "dry-run prints no slugs to stdout" {
  run --separate-stderr env PATH="$STUBDIR:$PATH" bash "$DETECT" --dry-run --min-age-hours 24
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [[ "$stderr" == *"select old-merged"* ]]
}
