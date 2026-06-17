#!/usr/bin/env bats
# Unit test for scripts/dev-reset.sh — one-click cluster reset for dev.
# All external commands are mocked; no Docker/k3d cluster required.

setup() {
  export MOCK_DIR=$(mktemp -d)
  export LOG_FILE=$(mktemp /tmp/dev-reset-test-log.XXXXXX)

  cat > "$MOCK_DIR/task" <<'SCRIPT'
#!/bin/bash
echo "task $*" >> "$LOG_FILE"
SCRIPT
  chmod +x "$MOCK_DIR/task"

  cat > "$MOCK_DIR/kubectl" <<'SCRIPT'
#!/bin/bash
echo "kubectl $*" >> "$LOG_FILE"
case "${1:-}" in
  config) echo "${KUBE_CONTEXT:-k3d-korczewski}" ;;
  cluster-info) ;;
  apply) echo "applied" ;;
  get) echo "mock" ;;
esac
SCRIPT
  chmod +x "$MOCK_DIR/kubectl"

  cat > "$MOCK_DIR/docker" <<'SCRIPT'
#!/bin/bash
echo "docker $*" >> "$LOG_FILE"
case "${1:-}" in
  info)
    if [ "${DOCKER_DOWN:-}" = "1" ]; then
      echo "Cannot connect to Docker daemon" >&2
      exit 1
    fi
    ;;
  image)
    if [ "$2" = "inspect" ]; then
      [ -f "$MOCK_IMAGE_LIST" ] || touch "$MOCK_IMAGE_LIST"
      if grep -qxF "$3" "$MOCK_IMAGE_LIST" 2>/dev/null; then
        exit 0
      else
        echo "No such image: $3" >&2
        exit 1
      fi
    fi
    ;;
esac
SCRIPT
  chmod +x "$MOCK_DIR/docker"

  cat > "$MOCK_DIR/k3d" <<'SCRIPT'
#!/bin/bash
echo "k3d $*" >> "$LOG_FILE"
SCRIPT
  chmod +x "$MOCK_DIR/k3d"

  export PATH="$MOCK_DIR:$PATH"
  export MOCK_IMAGE_LIST=$(mktemp /tmp/dev-reset-images.XXXXXX)
  export CLUSTER_NAME="korczewski"
  export CONFIRM="yes"
}

teardown() {
  rm -rf "$MOCK_DIR" "$MOCK_IMAGE_LIST" "$LOG_FILE" 2>/dev/null || true
}

# ── Prod Guard ───────────────────────────────────────────────────────

@test "prod guard: aborts when kubectl context is fleet" {
  KUBE_CONTEXT=fleet run bash scripts/dev-reset.sh
  [ "$status" -ne 0 ]
  [[ "$output" =~ "production" ]] || [[ "$output" =~ "fleet" ]]
}

@test "prod guard: allows k3d-korczewski context" {
  run bash scripts/dev-reset.sh
  [ "$status" -eq 0 ]
}

# ── Docker Guard ─────────────────────────────────────────────────────

@test "docker guard: aborts when docker info fails" {
  DOCKER_DOWN=1 run bash scripts/dev-reset.sh
  [ "$status" -ne 0 ]
}

# ── Image Reuse (default) ────────────────────────────────────────────

@test "image reuse default: k3d import called when images exist locally" {
  printf '%s\n' \
    "ghcr.io/paddione/workspace-website:latest" \
    "ghcr.io/paddione/workspace-brett:latest" \
    "ghcr.io/paddione/workspace-docs:latest" > "$MOCK_IMAGE_LIST"

  run bash scripts/dev-reset.sh
  [ "$status" -eq 0 ]

  grep -q "task website:build:import" "$LOG_FILE" && return 1 || true
  grep -q "task brett:build" "$LOG_FILE" && return 1 || true
  grep -q "task docs:build:import" "$LOG_FILE" && return 1 || true

  grep -q "k3d image import ghcr.io/paddione/workspace-website" "$LOG_FILE"
  grep -q "k3d image import ghcr.io/paddione/workspace-brett" "$LOG_FILE"
  grep -q "k3d image import ghcr.io/paddione/workspace-docs" "$LOG_FILE"
}

# ── Image Fallback ───────────────────────────────────────────────────

@test "image fallback: builds missing images" {
  printf '%s\n' \
    "ghcr.io/paddione/workspace-website:latest" \
    "ghcr.io/paddione/workspace-docs:latest" > "$MOCK_IMAGE_LIST"

  run bash scripts/dev-reset.sh
  [ "$status" -eq 0 ]

  grep -q "task brett:build ENV=dev" "$LOG_FILE"
}

@test "image fallback: re-imports existing, builds missing" {
  printf '%s\n' \
    "ghcr.io/paddione/workspace-website:latest" > "$MOCK_IMAGE_LIST"

  run bash scripts/dev-reset.sh
  [ "$status" -eq 0 ]

  grep -q "k3d image import ghcr.io/paddione/workspace-website" "$LOG_FILE"
  grep -q "task brett:build ENV=dev" "$LOG_FILE"
  grep -q "task docs:build:import ENV=dev" "$LOG_FILE"
}

# ── REBUILD=1 ────────────────────────────────────────────────────────

@test "REBUILD=1: all three build tasks are called" {
  printf '%s\n' \
    "ghcr.io/paddione/workspace-website:latest" \
    "ghcr.io/paddione/workspace-brett:latest" \
    "ghcr.io/paddione/workspace-docs:latest" > "$MOCK_IMAGE_LIST"

  REBUILD=1 run bash scripts/dev-reset.sh
  [ "$status" -eq 0 ]

  grep -q "task website:build:import ENV=dev" "$LOG_FILE"
  grep -q "task brett:build ENV=dev" "$LOG_FILE"
  grep -q "task docs:build:import ENV=dev" "$LOG_FILE"
}

@test "REBUILD=1: no k3d image import calls" {
  REBUILD=1 run bash scripts/dev-reset.sh
  [ "$status" -eq 0 ]

  grep -q "k3d image import" "$LOG_FILE" && return 1 || true
}

@test "REBUILD=1: builds missing images even when some are missing" {
  printf '%s\n' \
    "ghcr.io/paddione/workspace-website:latest" > "$MOCK_IMAGE_LIST"
  REBUILD=1 run bash scripts/dev-reset.sh
  [ "$status" -eq 0 ]
  grep -q "task website:build:import ENV=dev" "$LOG_FILE"
  grep -q "task brett:build ENV=dev" "$LOG_FILE"
  grep -q "task docs:build:import ENV=dev" "$LOG_FILE"
  # Should NOT call k3d image import (REBUILD=1 skips import)
  grep -q "k3d image import" "$LOG_FILE" && return 1 || true
}

# ── Execution Order ──────────────────────────────────────────────────

@test "execution order is correct" {
  run bash scripts/dev-reset.sh
  [ "$status" -eq 0 ]

  grep -q "task cluster:delete" "$LOG_FILE"
  grep -q "task cluster:create" "$LOG_FILE"
  grep -q "kubectl apply.*cert-manager" "$LOG_FILE"
  grep -q "task workspace:deploy ENV=dev" "$LOG_FILE"
  grep -q "task workspace:office:deploy ENV=dev" "$LOG_FILE"

  local delete_line=$(grep -n "task cluster:delete" "$LOG_FILE" | head -1 | cut -d: -f1)
  local create_line=$(grep -n "task cluster:create" "$LOG_FILE" | head -1 | cut -d: -f1)
  local crds_line=$(grep -n "kubectl apply.*cert-manager" "$LOG_FILE" | head -1 | cut -d: -f1)
  local deploy_line=$(grep -n "task workspace:deploy ENV=dev" "$LOG_FILE" | head -1 | cut -d: -f1)
  local office_line=$(grep -n "task workspace:office:deploy ENV=dev" "$LOG_FILE" | head -1 | cut -d: -f1)

  [ "$delete_line" -lt "$create_line" ]
  [ "$create_line" -lt "$crds_line" ]
  [ "$crds_line" -lt "$deploy_line" ]
  [ "$deploy_line" -lt "$office_line" ]
}

# ── CONFIRM=yes ──────────────────────────────────────────────────────

@test "CONFIRM=yes skips interactive prompt" {
  run bash scripts/dev-reset.sh
  [ "$status" -eq 0 ]
  [[ "$output" != *"Aborted"* ]]
}

@test "non-interactive without CONFIRM prints hint and exits" {
  unset CONFIRM
  run bash -c 'echo "" | bash scripts/dev-reset.sh'
  [ "$status" -ne 0 ]
  [[ "$output" =~ "CONFIRM=yes" ]]
}
