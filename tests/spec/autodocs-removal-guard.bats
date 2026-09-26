#!/usr/bin/env bats
# tests/spec/autodocs-removal-guard.bats
#
# SSOT: openspec/changes/autodocs-removal/specs/ci-cd.md
#   (Requirement: Keine Auto-Docs-Maschinerie mehr)
# Ticket: T900452
#
# Absence guard: the auto reading-docs machinery is gone — generator,
# serving path, serving tasks, env keys and site-only docs. The keeper
# block (f) is the positive anchor.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

@test "(a) generator gone: workflow, Dockerfile, build script, docs-gen dir" {
  [ ! -e "$REPO_ROOT/.github/workflows/build-docs.yml" ]
  [ ! -e "$REPO_ROOT/scripts/docs.Dockerfile" ]
  [ ! -e "$REPO_ROOT/scripts/build-docs.mjs" ]
  [ ! -e "$REPO_ROOT/scripts/docs-gen" ]
}

@test "(b) serving path gone: manifests, built tree and rule refs" {
  [ ! -e "$REPO_ROOT/k3d/docs.yaml" ]
  [ ! -e "$REPO_ROOT/k3d/oauth2-proxy-docs.yaml" ]
  [ ! -e "$REPO_ROOT/k3d/docs-content-built" ]
  local hits
  hits="$(grep -n 'docs\.localhost\|oauth2-proxy-docs\|docs\.yaml' \
    "$REPO_ROOT/k3d/ingress.yaml" "$REPO_ROOT/k3d/kustomization.yaml" || true)"
  [ -z "$hits" ] || { echo "stale serving refs: $hits"; return 1; }
}

@test "(c) tasks gone: no docs:build/docs:deploy/test:docs-gen definitions" {
  local hits
  hits="$(grep -nE '^  (docs:build|docs:deploy|test:docs-gen):' "$REPO_ROOT/Taskfile.yml" || true)"
  [ -z "$hits" ] || { echo "stale task definitions: $hits"; return 1; }
}

@test "(d) env keys gone: no DOCS_URL/DOCS_IMAGE in environments" {
  local hits
  hits="$(grep -n 'DOCS_URL\|DOCS_IMAGE' \
    "$REPO_ROOT/environments/mentolder.yaml" \
    "$REPO_ROOT/environments/korczewski.yaml" \
    "$REPO_ROOT/environments/fleet-mentolder.yaml" \
    "$REPO_ROOT/environments/fleet-korczewski.yaml" \
    "$REPO_ROOT/environments/staging.yaml" \
    "$REPO_ROOT/environments/dev.yaml" \
    "$REPO_ROOT/environments/schema.yaml" || true)"
  [ -z "$hits" ] || { echo "stale env keys: $hits"; return 1; }
}

@test "(e) docs sweep done: site-only docs absent" {
  [ ! -e "$REPO_ROOT/docs/brain/k4-brain-wiki.md" ]
  [ ! -e "$REPO_ROOT/docs/DOCS-DESIGN-STANDARDS.md" ]
}

@test "(f) keepers present: regen workflow, graph task, legacy-html, templates" {
  [ -f "$REPO_ROOT/.github/workflows/freshness-regen.yml" ]
  grep -qE '^  graph:build-docs:' "$REPO_ROOT/Taskfile.yml"
  [ -d "$REPO_ROOT/docs/legacy-html" ]
  [ -d "$REPO_ROOT/templates/brain" ]
}
