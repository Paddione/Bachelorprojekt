#!/usr/bin/env bats
# wg-mesh-fullmesh.bats — regression test for T000371.
#
# scripts/hetzner/generate-wg-conf.sh claims to emit a FULL-MESH WireGuard
# config, but its category tuple only iterated ('nodes','gpu_hosts','home_workers').
# The `fleet` env keeps its worker nodes under a `workers:` key (and the
# `mentolder` env keeps a `devc_servers:` key), so those nodes were silently
# dropped from every peer list — producing a hub-and-spoke mesh.
#
# Consequence (2026-05-31 outage): gekko fleet workers had no wg tunnel to each
# other; a pod on one worker could not reach CoreDNS/keycloak on another worker.
#
# These tests assert the generated config is a genuine full mesh for the fleet
# environment: every node (control-plane OR worker) appears as a peer in every
# other node's config.

load test_helper

SCRIPT="${PROJECT_DIR}/scripts/hetzner/generate-wg-conf.sh"
DUMMY_KEY="0000000000000000000000000000000000000000000="

# wg_ip markers from wireguard/wg-mesh-nodes.yaml (fleet env)
PK4_IP="10.20.0.1"
GEKKO2_IP="10.20.0.4"
GEKKO3_IP="10.20.0.5"
GEKKO4_IP="10.20.0.6"

@test "fleet worker config peers with the OTHER fleet workers (full mesh)" {
  run bash "$SCRIPT" --env fleet --node-name gekko-hetzner-4 --private-key "$DUMMY_KEY"
  assert_success
  # Must include the three control-plane peers...
  assert_output --partial "AllowedIPs = ${PK4_IP}/32"
  # ...AND the two sibling workers (the regression: these were missing).
  assert_output --partial "# gekko-hetzner-2"
  assert_output --partial "AllowedIPs = ${GEKKO2_IP}/32"
  assert_output --partial "# gekko-hetzner-3"
  assert_output --partial "AllowedIPs = ${GEKKO3_IP}/32"
  # Self must never be a peer.
  refute_output --partial "# gekko-hetzner-4"
}

@test "fleet control-plane config peers with the fleet workers" {
  run bash "$SCRIPT" --env fleet --node-name pk-hetzner-4 --private-key "$DUMMY_KEY"
  assert_success
  assert_output --partial "# gekko-hetzner-2"
  assert_output --partial "AllowedIPs = ${GEKKO2_IP}/32"
  assert_output --partial "# gekko-hetzner-4"
  assert_output --partial "AllowedIPs = ${GEKKO4_IP}/32"
  refute_output --partial "# pk-hetzner-4"
}

@test "fleet mesh is symmetric: every worker peers with every CP and worker" {
  for self in gekko-hetzner-2 gekko-hetzner-3 gekko-hetzner-4; do
    run bash "$SCRIPT" --env fleet --node-name "$self" --private-key "$DUMMY_KEY"
    assert_success
    # 6 peers expected (7 fleet nodes minus self).
    local peer_count
    peer_count=$(grep -c '^\[Peer\]' <<<"$output")
    [ "$peer_count" -eq 6 ] || {
      echo "node $self produced $peer_count peers, want 6" >&2
      return 1
    }
  done
}
