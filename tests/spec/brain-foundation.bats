#!/usr/bin/env bats
# tests/spec/brain-foundation.bats
# SSOT: openspec/specs/brain-foundation.md
setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  BOOTSTRAP="$REPO_ROOT/scripts/brain-bootstrap.sh"
  LINT_WL="$REPO_ROOT/templates/brain/scripts/lint-wikilinks.sh"
  LINT_FM="$REPO_ROOT/templates/brain/scripts/lint-frontmatter.sh"
  WORK="$(mktemp -d)"
}
teardown() { rm -rf "$WORK"; }

@test "bootstrap seeds the full Karpathy layout" {
  run bash "$BOOTSTRAP" "$WORK/brain"
  [ "$status" -eq 0 ]
  [ -f "$WORK/brain/SCHEMA.md" ]
  [ -f "$WORK/brain/index.md" ]
  [ -f "$WORK/brain/log.md" ]
  [ -d "$WORK/brain/raw" ]
  [ -d "$WORK/brain/wiki" ]
  [ -f "$WORK/brain/scripts/lint-wikilinks.sh" ]
  [ -f "$WORK/brain/scripts/lint-frontmatter.sh" ]
  [ -f "$WORK/brain/.github/workflows/ci.yml" ]
}

@test "bootstrap is idempotent — second run exits 0 and keeps seed" {
  run bash "$BOOTSTRAP" "$WORK/brain"; [ "$status" -eq 0 ]
  run bash "$BOOTSTRAP" "$WORK/brain"
  [ "$status" -eq 0 ]
  [ -f "$WORK/brain/SCHEMA.md" ]
  [ -f "$WORK/brain/wiki/example-note.md" ]
}

@test "bootstrap local mode performs no gh/network side effects" {
  run bash "$BOOTSTRAP" "$WORK/brain"
  [ "$status" -eq 0 ]
  [[ "$output" != *"repo create"* ]]
}

@test "lint-frontmatter flags a missing mandatory field" {
  mkdir -p "$WORK/w/wiki"
  printf -- '---\ntype: note\ntags: [x]\n---\nbody\n' > "$WORK/w/wiki/bad.md"
  run bash "$LINT_FM" "$WORK/w"
  [ "$status" -ne 0 ]
  [[ "$output" == *"missing required frontmatter field: status"* ]]
}

@test "lint-frontmatter passes a well-formed page" {
  mkdir -p "$WORK/w/wiki"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nbody\n' > "$WORK/w/wiki/ok.md"
  run bash "$LINT_FM" "$WORK/w"
  [ "$status" -eq 0 ]
}

@test "lint-wikilinks flags a dead link" {
  mkdir -p "$WORK/w/wiki"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nsee [[ghost]]\n' > "$WORK/w/wiki/a.md"
  run bash "$LINT_WL" "$WORK/w"
  [ "$status" -ne 0 ]
  [[ "$output" == *"dead wikilink: [[ghost]]"* ]]
}

@test "lint-wikilinks passes when every link resolves" {
  mkdir -p "$WORK/w/wiki"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nsee [[b]]\n' > "$WORK/w/wiki/a.md"
  printf -- '---\ntype: note\ntags: [x]\nstatus: active\n---\nhi\n' > "$WORK/w/wiki/b.md"
  run bash "$LINT_WL" "$WORK/w"
  [ "$status" -eq 0 ]
}

@test "seeded example pages satisfy their own frontmatter + wikilink lint" {
  run bash "$BOOTSTRAP" "$WORK/brain"; [ "$status" -eq 0 ]
  run bash "$WORK/brain/scripts/lint-frontmatter.sh" "$WORK/brain"; [ "$status" -eq 0 ]
  run bash "$WORK/brain/scripts/lint-wikilinks.sh" "$WORK/brain"; [ "$status" -eq 0 ]
}

@test "ci.yml wires both linters + a secret scan on push and pull_request" {
  run bash "$BOOTSTRAP" "$WORK/brain"; [ "$status" -eq 0 ]
  ci="$WORK/brain/.github/workflows/ci.yml"
  grep -q 'lint-wikilinks.sh' "$ci"
  grep -q 'lint-frontmatter.sh' "$ci"
  grep -qi 'gitleaks' "$ci"
  grep -q 'push' "$ci"
  grep -q 'pull_request' "$ci"
}

@test "bootstrap reads collaborator from --collaborator flag" {
  grep -q -- '--collaborator' "$BOOTSTRAP"
}
