#!/usr/bin/env bats
# tests/spec/terminal-sidekick.bats
# SSOT: openspec/specs/terminal-sidekick.md (post-archive)
# Structural assertions over the raw k3d/ + prod/ manifests + host script.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  K3D="${REPO_ROOT}/k3d"
  PROD="${REPO_ROOT}/prod"
}

@test "terminal: bridge Service is selector-less on port 7681" {
  f="${K3D}/terminal-sidekick.yaml"
  [ -f "$f" ]
  grep -qE 'name:[[:space:]]*terminal-bridge' "$f"
  grep -qE 'port:[[:space:]]*7681' "$f"
  # no `selector:` key anywhere in the bridge manifest
  ! grep -qE '^[[:space:]]*selector:' "$f"
}

@test "terminal: Endpoints target the overlay IP placeholder" {
  grep -qE 'ip:[[:space:]]*"\$\{TERMINAL_OVERLAY_IP\}"' "${K3D}/terminal-sidekick.yaml"
}

@test "terminal: oauth2-proxy carries client-id + group-gate flags" {
  f="${K3D}/oauth2-proxy-terminal.yaml"
  [ -f "$f" ]
  grep -qE 'client-id=terminal-sidekick' "$f"
  grep -qE 'allowed-group=terminal-admins' "$f"
  grep -qE 'oidc-groups-claim=groups' "$f"
  grep -qE 'upstream=http://terminal-bridge:7681' "$f"
}

@test "terminal: dev ingress routes terminal.localhost to the proxy" {
  grep -qE 'host:[[:space:]]*terminal\.localhost' "${K3D}/ingress.yaml"
}

@test "terminal: TERMINAL_HOST configmap key present (dev + prod)" {
  grep -qE 'TERMINAL_HOST:[[:space:]]*"terminal\.localhost"' "${K3D}/configmap-domains.yaml"
  grep -qE 'TERMINAL_HOST:[[:space:]]*"terminal\.\$\{PROD_DOMAIN\}"' "${PROD}/configmap-domains.yaml"
}

@test "terminal: new manifests are registered in kustomization (no orphans)" {
  grep -qE 'terminal-sidekick\.yaml' "${K3D}/kustomization.yaml"
  grep -qE 'oauth2-proxy-terminal\.yaml' "${K3D}/kustomization.yaml"
}

@test "terminal: no hardcoded brand domain in the new k3d manifests" {
  ! grep -REn 'terminal\.(mentolder|korczewski)\.de' "${K3D}/terminal-sidekick.yaml" "${K3D}/oauth2-proxy-terminal.yaml"
}

@test "terminal: seed job registers the terminal-sidekick client row" {
  f="${K3D}/pocket-id-client-seed.yaml"
  grep -qE 'terminal-sidekick\|SECRET_terminal\|POCKET_ID_TERMINAL_SECRET\|\$\{SCHEME\}://terminal\.\$\{SUFFIX\}/oauth2/callback' "$f"
  grep -qE 'name:[[:space:]]*SECRET_terminal' "$f"
  grep -qE 'key:[[:space:]]*POCKET_ID_TERMINAL_SECRET' "$f"
}

@test "terminal: fleet wg peer and overlay IP is registered" {
  grep -qE 'wg_ip:[[:space:]]*"10\.20\.0\.10"' "${REPO_ROOT}/wireguard/wg-mesh-nodes.yaml"
  grep -qE 'name:[[:space:]]*TERMINAL_OVERLAY_IP' "${REPO_ROOT}/environments/schema.yaml"
}

@test "terminal: prod proxy patch sets cross-origin cookie + group gate" {
  f="${PROD}/patch-oauth2-proxy-terminal.yaml"
  [ -f "$f" ]
  grep -qE 'cookie-samesite=none' "$f"
  grep -qE 'cookie-secure=true' "$f"
  grep -qE 'allowed-group=terminal-admins' "$f"
  grep -qE 'redirect-url=https://terminal\.\$\{PROD_DOMAIN\}/oauth2/callback' "$f"
}

@test "terminal: prod ingress + kustomization wire the terminal host" {
  grep -qE 'host:[[:space:]]*terminal\.\$\{PROD_DOMAIN\}' "${PROD}/ingress.yaml"
  grep -qE 'patch-oauth2-proxy-terminal\.yaml' "${PROD}/kustomization.yaml"
}

@test "terminal: host setup script binds wg IP, is writable, opens four windows" {
  f="${REPO_ROOT}/scripts/terminal-sidekick-host.sh"
  [ -f "$f" ]
  [ -x "$f" ]
  grep -qE 'ttyd' "$f"
  grep -qE -- '--writable' "$f"
  grep -qE -- '--interface' "$f"
  # not bound to all interfaces
  ! grep -qE 'interface[= ]0\.0\.0\.0' "$f"
  # four agent windows
  for w in opencode hermes claude agy; do grep -qE "$w" "$f"; done
  # idempotent guard: checks for an existing session before creating one
  grep -qE 'has-session' "$f"
}

