#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# dev-build-safety.bats — Guard against OOM crashes in dev Astro build
# ═══════════════════════════════════════════════════════════════════
# The pixi.js + Astro build is memory-hungry. Without an explicit
# Node.js heap cap, docker build on the dev node (k3s-1) crashes with
# SIGSEGV or esbuild memory-corruption parse errors (T000315).
# Stale docker build processes from timed-out SSH sessions compound
# the problem by running two concurrent builds simultaneously.
# ═══════════════════════════════════════════════════════════════════

load test_helper

# ── Dockerfile heap cap ──────────────────────────────────────────

@test "website/Dockerfile build stage sets NODE_OPTIONS with max-old-space-size" {
  # Without this, Node.js has no explicit heap limit and crashes with
  # SIGSEGV on the memory-constrained dev node when building pixi.js+Astro.
  local dockerfile="${PROJECT_DIR}/website/Dockerfile"
  [[ -f "$dockerfile" ]] || fail "website/Dockerfile not found"

  run grep -E "NODE_OPTIONS.*max-old-space-size" "$dockerfile"
  assert_success
  assert_output --partial "max-old-space-size"
}

@test "website/Dockerfile NODE_OPTIONS heap limit is at least 2048 MB" {
  local dockerfile="${PROJECT_DIR}/website/Dockerfile"
  [[ -f "$dockerfile" ]] || fail "website/Dockerfile not found"

  # Extract the numeric value from --max-old-space-size=<N>
  local value
  value=$(grep -oE "max-old-space-size=[0-9]+" "$dockerfile" | grep -oE "[0-9]+" | head -1)
  [[ -n "$value" ]] || fail "max-old-space-size not found in Dockerfile"
  (( value >= 2048 )) || fail "max-old-space-size=${value} is below minimum 2048 MB"
}

@test "website/Dockerfile NODE_OPTIONS is set in the build stage (before runtime stage)" {
  local dockerfile="${PROJECT_DIR}/website/Dockerfile"
  [[ -f "$dockerfile" ]] || fail "website/Dockerfile not found"

  # The flag must appear BEFORE the "runtime stage" comment/FROM line
  # so it only affects the build, not the running container.
  local build_line runtime_line node_opts_line
  build_line=$(grep -n "Build stage\|AS build" "$dockerfile" | head -1 | cut -d: -f1)
  runtime_line=$(grep -n "Runtime stage\|AS runtime" "$dockerfile" | head -1 | cut -d: -f1)
  node_opts_line=$(grep -n "NODE_OPTIONS.*max-old-space-size" "$dockerfile" | head -1 | cut -d: -f1)

  [[ -n "$build_line" ]]     || fail "Build stage marker not found in Dockerfile"
  [[ -n "$runtime_line" ]]   || fail "Runtime stage marker not found in Dockerfile"
  [[ -n "$node_opts_line" ]] || fail "NODE_OPTIONS line not found in Dockerfile"

  (( node_opts_line < runtime_line )) || \
    fail "NODE_OPTIONS (line $node_opts_line) must be in build stage (before runtime at line $runtime_line)"
}

# ── Taskfile stale-build guard ───────────────────────────────────

@test "Taskfile.dev-stack.yml build:website kills stale docker builds before starting" {
  # When a previous SSH session times out (20m), docker build keeps running
  # on k3s-1. The next push starts a second concurrent build -> OOM.
  local taskfile="${PROJECT_DIR}/Taskfile.dev-stack.yml"
  [[ -f "$taskfile" ]] || fail "Taskfile.dev-stack.yml not found"

  # The build:website task must contain a stale-process cleanup before docker build.
  # We look for a kill/pkill/buildx-prune pattern inside the build:website block.
  run awk '/^  build:website:/{ found=1; next } found && /^  [a-zA-Z]/ && !/^    /{ exit } found{ print }' "$taskfile"
  assert_success

  local task_block="$output"
  if ! echo "$task_block" | grep -qE "(pkill|killall|buildx prune|docker.*kill).*docker|docker.*(pkill|kill|prune)"; then
    fail "build:website task must kill stale docker builds before starting (pkill/buildx prune pattern missing)"
  fi
}
