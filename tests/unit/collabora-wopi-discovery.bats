#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# collabora-wopi-discovery.bats — Collabora WOPI urlsrc host resolution
# ═══════════════════════════════════════════════════════════════════
# T000478 / T2-deploy-and-verify-collabora-discovery
#
# Collabora Online (coolwsd) emits the WOPI discovery `urlsrc` host from
# its `server_name` setting. On the shared fleet office-stack BOTH brands
# (mentolder + korczewski) hit the same `collabora` Deployment, so a
# hardcoded `server_name=office.mentolder.de` makes
# `office.korczewski.de/hosting/discovery` wrongly advertise
# `office.mentolder.de`.
#
# Fix: deploy with an EMPTY `COLLABORA_SERVER_NAME`. coolwsd then derives
# the host dynamically from the incoming request Host header, so each
# brand's discovery endpoint returns its own host.
#
# These tests pin the deploy-time contract that the live curl checks in
# the Verify phase depend on:
#   curl -s https://office.mentolder.de/hosting/discovery  → office.mentolder.de
#   curl -s https://office.korczewski.de/hosting/discovery → office.korczewski.de
#
# Pure static analysis — no cluster required.
# ═══════════════════════════════════════════════════════════════════

load test_helper

setup_file() {
  export TASKFILE="${PROJECT_DIR}/Taskfile.yml"
  export COLLABORA_MANIFEST="${PROJECT_DIR}/k3d/office-stack/collabora.yaml"
}

# ── Taskfile deploy contract ─────────────────────────────────────────

@test "office:deploy does NOT hardcode COLLABORA_SERVER_NAME to a brand host" {
  # A literal office.<domain> value forces the discovery urlsrc host and
  # breaks the non-default brand on the shared stack.
  run grep -nE 'export[[:space:]]+COLLABORA_SERVER_NAME="office\.\$\{PROD_DOMAIN\}"' "$TASKFILE"
  [ "$status" -ne 0 ] || {
    echo "Found hardcoded COLLABORA_SERVER_NAME=office.\${PROD_DOMAIN}:" >&2
    echo "$output" >&2
    false
  }
}

@test "office:deploy exports an empty COLLABORA_SERVER_NAME for dynamic Host resolution" {
  # Every deploy target that sets COLLABORA_SERVER_NAME must set it empty.
  run grep -cE 'export[[:space:]]+COLLABORA_SERVER_NAME=""' "$TASKFILE"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "every COLLABORA_SERVER_NAME assignment in Taskfile is the empty form" {
  # Guard against one of the two deploy call sites being left hardcoded.
  total=$(grep -cE 'export[[:space:]]+COLLABORA_SERVER_NAME=' "$TASKFILE" || true)
  empty=$(grep -cE 'export[[:space:]]+COLLABORA_SERVER_NAME=""' "$TASKFILE" || true)
  [ "$total" -ge 1 ]
  [ "$total" -eq "$empty" ]
}

# ── Manifest wiring (regression guard) ───────────────────────────────

@test "collabora manifest still wires server_name from COLLABORA_SERVER_NAME" {
  # If the env-var plumbing is renamed the empty-value fix becomes a no-op.
  run grep -nE 'value:[[:space:]]*"\$\{COLLABORA_SERVER_NAME\}"' "$COLLABORA_MANIFEST"
  [ "$status" -eq 0 ]
}
