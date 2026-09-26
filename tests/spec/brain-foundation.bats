#!/usr/bin/env bats
# tests/spec/brain-foundation.bats
# SSOT: openspec/specs/brain-foundation.md
setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  LINT_WL="$REPO_ROOT/templates/brain/scripts/lint-wikilinks.sh"
  LINT_FM="$REPO_ROOT/templates/brain/scripts/lint-frontmatter.sh"
  WORK="$(mktemp -d)"
}
teardown() { rm -rf "$WORK"; }

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

# --- T001578: site.Dockerfile template must be buildable -------------------

@test "site.Dockerfile pins quartz v4.5.2 via tagged clone" {
  grep -q -- '--branch v4.5.2' "$REPO_ROOT/templates/brain/site.Dockerfile"
}

@test "site.Dockerfile runtime stage uses the official static-web-server image" {
  grep -q 'ghcr.io/static-web-server/static-web-server:2-alpine' \
    "$REPO_ROOT/templates/brain/site.Dockerfile"
}

@test "site.Dockerfile has no npm ci against a nonexistent package.json" {
  df="$REPO_ROOT/templates/brain/site.Dockerfile"
  ! grep -q 'COPY package' "$df"
  ! grep -q -- '--only=production' "$df"
}

@test "build-site.yml workflow template exists and pushes brain-site:latest" {
  wf="$REPO_ROOT/templates/brain/.github/workflows/build-site.yml"
  [ -f "$wf" ]
  grep -q 'ghcr.io/paddione/brain-site:latest' "$wf"
  grep -q 'site.Dockerfile' "$wf"
}

# --- T001884: Mermaid-Markdown architecture page (E3) ---

@test "build-graph-docs.mjs emits docs/diagrams/architecture.md with mermaid fences, not HTML" {
  cd "$REPO_ROOT"
  WORK="$(mktemp -d)"
  ARCH_OUT="$WORK/architecture.md" run node scripts/build-graph-docs.mjs
  [ "$status" -eq 0 ] || { echo "FAIL: generator exited non-zero: $output"; rm -rf "$WORK"; return 1; }
  [ -f "$WORK/architecture.md" ] || { echo "FAIL: architecture.md not written"; rm -rf "$WORK"; return 1; }
  grep -q '```mermaid' "$WORK/architecture.md" \
    || { echo "FAIL: no mermaid fence in output"; rm -rf "$WORK"; return 1; }
  ! grep -q '<html' "$WORK/architecture.md" \
    || { echo "FAIL: output still contains raw HTML"; rm -rf "$WORK"; return 1; }
  ! grep -q 'cdn.jsdelivr.net' "$WORK/architecture.md" \
    || { echo "FAIL: output still references the CDN mermaid script"; rm -rf "$WORK"; return 1; }
  rm -rf "$WORK"
}

@test "docs/diagrams/architecture.md is byte-identical across two consecutive generator runs (no embedded timestamp)" {
  cd "$REPO_ROOT"
  WORK="$(mktemp -d)"
  ARCH_OUT="$WORK/architecture.md" run node scripts/build-graph-docs.mjs
  [ "$status" -eq 0 ]
  first="$(cat "$WORK/architecture.md")"
  ARCH_OUT="$WORK/architecture.md" run node scripts/build-graph-docs.mjs
  [ "$status" -eq 0 ]
  second="$(cat "$WORK/architecture.md")"
  [ "$first" = "$second" ] || { echo "FAIL: output differs between consecutive runs — likely an embedded timestamp"; rm -rf "$WORK"; return 1; }
  rm -rf "$WORK"
}
