#!/usr/bin/env bats

# PRUEFMODUS: Output-Verifikation
# Fix: T004261 (p1)

setup() {
  BATS_TMPDIR=$(mktemp -d)
  FIXTURE="$BATS_TMPDIR/repo"
  mkdir -p "$FIXTURE/.githooks"
  mkdir -p "$FIXTURE/scripts/lib"
  mkdir -p "$FIXTURE/bin"
  
  # Symlinks to real hook and helpers
  ln -s "$(pwd)/.githooks/pre-commit" "$FIXTURE/.githooks/pre-commit"
  ln -s "$(pwd)/scripts/agent-lock.sh" "$FIXTURE/scripts/agent-lock.sh"
  ln -s "$(pwd)/scripts/agent-collision.sh" "$FIXTURE/scripts/agent-collision.sh"
  ln -s "$(pwd)/scripts/git-crypt-guard.sh" "$FIXTURE/scripts/git-crypt-guard.sh"
  ln -s "$(pwd)/scripts/openspec-half-archive-check.sh" "$FIXTURE/scripts/openspec-half-archive-check.sh"
  ln -s "$(pwd)/scripts/openspec-main-staging-guard.sh" "$FIXTURE/scripts/openspec-main-staging-guard.sh"
  ln -s "$(pwd)/scripts/guard-bonsai-overwrite.sh" "$FIXTURE/scripts/guard-bonsai-overwrite.sh"
  ln -s "$(pwd)/scripts/lib/branch-allowlist.sh" "$FIXTURE/scripts/lib/branch-allowlist.sh"
  ln -s "$(pwd)/.gitleaks.toml" "$FIXTURE/.gitleaks.toml"

  # Symlink ALL agent-lock related scripts
  ln -s "$(pwd)/scripts/agent-lock-identity.sh" "$FIXTURE/scripts/agent-lock-identity.sh"
  ln -s "$(pwd)/scripts/agent-lock-guards.sh" "$FIXTURE/scripts/agent-lock-guards.sh"
  ln -s "$(pwd)/scripts/agent-lock-merged.sh" "$FIXTURE/scripts/agent-lock-merged.sh"
  ln -s "$(pwd)/scripts/agent-lock-activity.sh" "$FIXTURE/scripts/agent-lock-activity.sh"

  # PATH stub for gitleaks
  echo '#!/bin/bash' > "$FIXTURE/bin/gitleaks"
  echo 'echo "gitleaks stub"; exit 0' >> "$FIXTURE/bin/gitleaks"
  chmod +x "$FIXTURE/bin/gitleaks"

  cd "$FIXTURE"
  git init -b feat/batch-demo-T003123
  git config user.email "test@example.com"
  git config user.name "Test User"
  touch sample.txt
  git add sample.txt
  git commit -m "chore: init"
}

teardown() {
  rm -rf "$BATS_TMPDIR"
}

@test "Test 1: branch experiment/foo -> status != 0 + output contains branch name" {
  git checkout -b experiment/foo
  
  # Bypasses for hermetic state
  export AGENT_LOCK_FORCE=1
  export SKIP_FRESHNESS_REGEN=1
  export SKIP_BONSAI_GUARD=1
  export SKIP_MAIN_COMMIT_GUARD=1
  # SKIP_BRANCH_CHECK remains UNSET

  run env PATH="$FIXTURE/bin:$PATH" bash "$FIXTURE/.githooks/pre-commit"
  
  [ "$status" != 0 ]
  [[ "$output" =~ "experiment/foo" ]]
}

@test "Test 2: branch feat/batch-demo-T003123 -> status == 0" {
  # Already on feat/batch-demo-T003123 from setup
  
  export AGENT_LOCK_FORCE=1
  export SKIP_FRESHNESS_REGEN=1
  export SKIP_BONSAI_GUARD=1
  export SKIP_MAIN_COMMIT_GUARD=1

  run env PATH="$FIXTURE/bin:$PATH" bash "$FIXTURE/.githooks/pre-commit"
  
  if [ "$status" != 0 ]; then
    echo "DEBUG: status is $status"
    echo "DEBUG: output is: $output"
  fi
  [ "$status" == 0 ]
}
