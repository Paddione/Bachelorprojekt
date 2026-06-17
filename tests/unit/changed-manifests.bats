#!/usr/bin/env bats
# changed-manifests.bats — test scripts/changed-manifests.sh manifest detection
# Each test creates an isolated git repo in BATS_TMPDIR, commits a snapshot,
# then adds changes and checks the helper's exit code and output.

load test_helper

CHANGED_MANIFESTS="${PROJECT_DIR}/scripts/changed-manifests.sh"

setup() {
  REPO_DIR="$(mktemp -d)"
  export GIT_AUTHOR_NAME="test"
  export GIT_AUTHOR_EMAIL="test@test"
  export GIT_COMMITTER_NAME="test"
  export GIT_COMMITTER_EMAIL="test@test"
  cd "$REPO_DIR"
  git init -q
  git config user.name "test"
  git config user.email "test@test"
}

teardown() {
  cd /
  rm -rf "$REPO_DIR"
}

create_commit() {
  local msg="${1:-init}"
  git add -A 2>/dev/null || true
  git commit -q -m "$msg" 2>/dev/null || git commit -q --allow-empty -m "$msg"
}

@test "detects manifest change in k3d/" {
  mkdir -p k3d
  create_commit "base"
  echo "apiVersion: v1" > k3d/foo.yaml
  create_commit "add k3d manifest"

  run bash "$CHANGED_MANIFESTS" "HEAD~1" "HEAD"
  [ "$status" -eq 0 ]
  [[ "$output" == *"k3d/foo.yaml"* ]]
}

@test "detects manifest change in prod-fleet/" {
  mkdir -p prod-fleet/mentolder
  create_commit "base"
  echo "resources:" > prod-fleet/mentolder/kustomization.yaml
  create_commit "add prod-fleet kustomization"

  run bash "$CHANGED_MANIFESTS" "HEAD~1" "HEAD"
  [ "$status" -eq 0 ]
  [[ "$output" == *"prod-fleet/mentolder/kustomization.yaml"* ]]
}

@test "detects manifest change in environments/" {
  mkdir -p environments
  create_commit "base"
  echo "brand: mentolder" > environments/mentolder.yaml
  create_commit "add environment file"

  run bash "$CHANGED_MANIFESTS" "HEAD~1" "HEAD"
  [ "$status" -eq 0 ]
  [[ "$output" == *"environments/mentolder.yaml"* ]]
}

@test "no manifest change — docs only" {
  mkdir -p docs
  create_commit "base"
  echo "# docs" > docs/x.md
  create_commit "docs change"

  run bash "$CHANGED_MANIFESTS" "HEAD~1" "HEAD"
  [ "$status" -eq 1 ]
}

@test "no manifest change — website only" {
  mkdir -p website/src/pages
  create_commit "base"
  echo "---" > website/src/pages/index.astro
  create_commit "website change"

  run bash "$CHANGED_MANIFESTS" "HEAD~1" "HEAD"
  [ "$status" -eq 1 ]
  [[ "$output" == *"no manifest changes"* ]]
}

@test "no manifest change — empty diff" {
  create_commit "only commit"

  run bash "$CHANGED_MANIFESTS" "HEAD" "HEAD"
  [ "$status" -eq 1 ]
  [[ "$output" == *"no manifest changes"* ]]
}

@test "detects manifest in prod-mentolder/" {
  mkdir -p prod-mentolder
  create_commit "base"
  echo "key: val" > prod-mentolder/config.yaml
  create_commit "add prod-mentolder config"

  run bash "$CHANGED_MANIFESTS" "HEAD~1" "HEAD"
  [ "$status" -eq 0 ]
  [[ "$output" == *"prod-mentolder/config.yaml"* ]]
}

@test "detects manifest in prod-korczewski/" {
  mkdir -p prod-korczewski
  create_commit "base"
  echo "key: val" > prod-korczewski/config.yaml
  create_commit "add prod-korczewski config"

  run bash "$CHANGED_MANIFESTS" "HEAD~1" "HEAD"
  [ "$status" -eq 0 ]
  [[ "$output" == *"prod-korczewski/config.yaml"* ]]
}

@test "detects manifest in prod/" {
  mkdir -p prod
  create_commit "base"
  echo "key: val" > prod/config.yaml
  create_commit "add prod config"

  run bash "$CHANGED_MANIFESTS" "HEAD~1" "HEAD"
  [ "$status" -eq 0 ]
  [[ "$output" == *"prod/config.yaml"* ]]
}

@test "mixed: manifest + non-manifest — still exits 0" {
  mkdir -p k3d docs website/src
  create_commit "base"
  echo "apiVersion: v1" > k3d/foo.yaml
  echo "# docs" > docs/x.md
  echo "---" > website/src/index.astro
  create_commit "mixed changes"

  run bash "$CHANGED_MANIFESTS" "HEAD~1" "HEAD"
  [ "$status" -eq 0 ]
  [[ "$output" == *"k3d/foo.yaml"* ]]
}

@test "default args use HEAD~1 HEAD when none given" {
  mkdir -p k3d
  create_commit "base"
  echo "apiVersion: v1" > k3d/bar.yaml
  create_commit "add k3d manifest"

  run bash "$CHANGED_MANIFESTS"
  [ "$status" -eq 0 ]
  [[ "$output" == *"k3d/bar.yaml"* ]]
}
