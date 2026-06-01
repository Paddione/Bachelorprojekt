#!/usr/bin/env bats
# render-cloud-init.bats — unit tests for scripts/hetzner/render-cloud-init.sh

load test_helper

SCRIPT="${PROJECT_DIR}/scripts/hetzner/render-cloud-init.sh"

setup() {
  TMPDIR=$(mktemp -d)

  # Minimal versions.yaml fixture
  cat > "${TMPDIR}/versions.yaml" << 'EOF'
k3s: v9.99.0+k3s1
sealed_secrets_chart: 9.1.0
cert_manager: v9.2.0
longhorn_chart: 9.3.0
EOF

  # Minimal cloud-init template that exercises substitution
  cat > "${TMPDIR}/tpl.yaml" << 'EOF'
#cloud-config
# rendered: NODE_IP=${NODE_IP} K3S_VERSION=${K3S_VERSION} K3S_URL=${K3S_URL}
ssh_authorized_keys:
  - ${SSH_PUBLIC_KEY}
EOF
}

teardown() {
  rm -rf "$TMPDIR"
}

_base_args() {
  echo --versions-file "${TMPDIR}/versions.yaml" \
       --template "${TMPDIR}/tpl.yaml" \
       --node-ip 1.2.3.4 \
       --wg-listen-port 51820 \
       --k3s-url "https://192.168.100.1:6443" \
       --k3s-token "testtoken" \
       --ssh-key "ssh-ed25519 AAAA testkey"
}

@test "substitutes NODE_IP" {
  run bash "$SCRIPT" $(_base_args)
  assert_success
  assert_output --partial "NODE_IP=1.2.3.4"
}

@test "substitutes K3S_VERSION from versions.yaml" {
  run bash "$SCRIPT" $(_base_args)
  assert_success
  assert_output --partial "K3S_VERSION=v9.99.0+k3s1"
}

@test "substitutes K3S_URL" {
  run bash "$SCRIPT" $(_base_args)
  assert_success
  assert_output --partial "K3S_URL=https://192.168.100.1:6443"
}

@test "substitutes SSH_PUBLIC_KEY" {
  run bash "$SCRIPT" $(_base_args)
  assert_success
  assert_output --partial "ssh-ed25519 AAAA testkey"
}

@test "output starts with #cloud-config" {
  run bash "$SCRIPT" $(_base_args)
  assert_success
  assert_output --partial "#cloud-config"
}

@test "fails when --node-ip is missing" {
  run bash "$SCRIPT" \
    --versions-file "${TMPDIR}/versions.yaml" \
    --template "${TMPDIR}/tpl.yaml" \
    --k3s-url "https://192.168.100.1:6443" \
    --k3s-token "testtoken" \
    --ssh-key "ssh-ed25519 AAAA testkey"
  assert_failure
  assert_output --partial "node-ip"
}

@test "fails when versions file does not exist" {
  run bash "$SCRIPT" \
    --versions-file "/nonexistent/versions.yaml" \
    --template "${TMPDIR}/tpl.yaml" \
    --node-ip 1.2.3.4 \
    --wg-listen-port 51820 \
    --k3s-url "https://192.168.100.1:6443" \
    --k3s-token "testtoken" \
    --ssh-key "ssh-ed25519 AAAA testkey"
  assert_failure
  assert_output --partial "versions file"
}

@test "fails when template does not exist" {
  run bash "$SCRIPT" \
    --versions-file "${TMPDIR}/versions.yaml" \
    --template "/nonexistent/tpl.yaml" \
    --node-ip 1.2.3.4 \
    --wg-listen-port 51820 \
    --k3s-url "https://192.168.100.1:6443" \
    --k3s-token "testtoken" \
    --ssh-key "ssh-ed25519 AAAA testkey"
  assert_failure
  assert_output --partial "template"
}
