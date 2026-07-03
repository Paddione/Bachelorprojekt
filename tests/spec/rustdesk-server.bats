#!/usr/bin/env bats
# tests/spec/rustdesk-server.bats
# SSOT: openspec/specs/rustdesk-server.md (post-archive)
# Renders k3d/rustdesk-stack offline and asserts the hbbs/hbbr contract.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  STACK="${REPO_ROOT}/k3d/rustdesk-stack"
  WORKFLOW="${REPO_ROOT}/.github/workflows/build-rustdesk-installer.yml"
  K3D="${REPO_ROOT}/k3d"
}

@test "rustdesk: kustomize build k3d/rustdesk-stack succeeds (no broken refs)" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  run kustomize build "$STACK"
  [ "$status" -eq 0 ]
}

@test "rustdesk: namespace enforces privileged PSA" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  out="$(kustomize build "$STACK")"
  echo "$out" | grep -qE 'kind:[[:space:]]+Namespace'
  echo "$out" | grep -qE 'pod-security.kubernetes.io/enforce:[[:space:]]*privileged'
}

@test "rustdesk: hbbs + hbbr run on hostNetwork, pinned to \${TURN_NODE}" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  out="$(kustomize build "$STACK")"
  # two Deployments
  [ "$(echo "$out" | grep -cE '^kind:[[:space:]]+Deployment')" -eq 2 ]
  echo "$out" | grep -qE 'hostNetwork:[[:space:]]*true'
  echo "$out" | grep -qE 'kubernetes.io/hostname:[[:space:]]*\$\{TURN_NODE\}'
}

@test "rustdesk: hbbs exposes 21115/tcp and 21116 tcp+udp" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  out="$(kustomize build "$STACK")"
  echo "$out" | grep -qE 'hostPort:[[:space:]]*21115'
  echo "$out" | grep -qE 'hostPort:[[:space:]]*21116'
  # 21116 must appear for both TCP and UDP
  [ "$(echo "$out" | grep -cE 'containerPort:[[:space:]]*21116')" -ge 2 ]
}

@test "rustdesk: hbbr exposes 21117/tcp" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  out="$(kustomize build "$STACK")"
  echo "$out" | grep -qE 'hostPort:[[:space:]]*21117'
}

@test "rustdesk-web: hbbs adds web-client port 21118/tcp, hbbr adds 21119/tcp" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  out="$(kustomize build "$STACK")"
  echo "$out" | grep -qE 'hostPort:[[:space:]]*21118'
  echo "$out" | grep -qE 'hostPort:[[:space:]]*21119'
}

@test "rustdesk-web: bridge Services are selector-less with matching Endpoints to \${TURN_OVERLAY_IP}" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  out="$(kustomize build "$K3D" --load-restrictor=LoadRestrictionsNone)"
  # both bridge Services exist
  echo "$out" | grep -qE 'name:[[:space:]]*rustdesk-web-hbbs'
  echo "$out" | grep -qE 'name:[[:space:]]*rustdesk-web-hbbr'
  # matching Endpoints object referencing the overlay IP placeholder
  echo "$out" | grep -qE 'kind:[[:space:]]*Endpoints'
  echo "$out" | grep -qE 'ip:[[:space:]]*"?\$\{TURN_OVERLAY_IP\}"?'
  # the bridge Services must NOT carry a selector (manually managed Endpoints)
  svc_block="$(echo "$out" | awk '/name: rustdesk-web-hbbs/,/^---/')"
  ! echo "$svc_block" | grep -qE '^\s*selector:'
}

@test "rustdesk-web: oauth2-proxy-rustdesk-web fronts the bridges (downloads pattern)" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  out="$(kustomize build "$K3D" --load-restrictor=LoadRestrictionsNone)"
  echo "$out" | grep -qE 'name:[[:space:]]*oauth2-proxy-rustdesk-web'
  echo "$out" | grep -qE 'client-id=rustdesk-web'
  echo "$out" | grep -qE 'rustdesk-web-hbbs:21118'
  echo "$out" | grep -qE 'rustdesk-web-hbbr:21119'
}

@test "rustdesk-web: dev ingress routes remote.localhost to the proxy" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  out="$(kustomize build "$K3D" --load-restrictor=LoadRestrictionsNone)"
  echo "$out" | grep -qE 'host:[[:space:]]*remote\.localhost'
}

@test "rustdesk-web: every ufw 21118/21119 rule is overlay-restricted (10.20.0.0/16)" {
  for f in prod/cloud-init.yaml \
           scripts/hetzner/cloud-init.yaml.tmpl \
           scripts/hetzner/cloud-init-server.yaml.tmpl; do
    # the port rule must exist
    grep -qE '2111[89]' "${REPO_ROOT}/${f}"
    # and NO 21118/21119 line may lack the overlay CIDR (guards public exposure)
    ! grep -E '2111[89]' "${REPO_ROOT}/${f}" | grep -vqE '10\.20\.0\.0/16'
  done
}

@test "rustdesk: image is digest-pinned" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  out="$(kustomize build "$STACK")"
  echo "$out" | grep -qE 'image:[[:space:]]*rustdesk/rustdesk-server:[^@]+@sha256:[0-9a-f]{64}'
}

# ── RustDesk MSI installer + SSO-gated downloads surface (T001378) ──────
# SSOT: openspec/specs/rustdesk-server.md (REQ-RUSTDESK-CLIENT-001..004).
# The MSI itself is a Windows artifact whose real gate is the windows-latest CI
# smoke test; these BATS cover the locally-testable k8s / CI / WiX contract.

@test "rustdesk-client: k3d base builds with downloads + oauth2-proxy-downloads" {
  command -v kubectl >/dev/null || skip "kubectl not installed"
  out="$(kubectl kustomize "${REPO_ROOT}/k3d")"
  echo "$out" | grep -qE '^  name: downloads$'
  echo "$out" | grep -qE '^  name: oauth2-proxy-downloads$'
}

@test "rustdesk-client: downloads ingress routes through the oauth2-proxy (SSO gate, REQ-003)" {
  command -v kubectl >/dev/null || skip "kubectl not installed"
  out="$(kubectl kustomize "${REPO_ROOT}/k3d")"
  # The dev host route must target the oauth2-proxy, never downloads:80 directly.
  echo "$out" | grep -A8 'host: downloads.localhost' | grep -q 'oauth2-proxy-downloads'
}

@test "rustdesk-client: prod overlay wires downloads for fleet reachability" {
  command -v kubectl >/dev/null || skip "kubectl not installed"
  out="$(kubectl kustomize "${REPO_ROOT}/prod")"
  echo "$out" | grep -q 'workspace-ingress-downloads'
  echo "$out" | grep -q 'oauth2-proxy-downloads'
}

@test "rustdesk-client: no brand-domain literal in downloads manifests (S3)" {
  ! grep -REn 'mentolder\.de|korczewski\.de' \
      "${REPO_ROOT}/k3d/downloads.yaml" \
      "${REPO_ROOT}/k3d/oauth2-proxy-downloads.yaml" \
      "${REPO_ROOT}/prod/patch-oauth2-proxy-downloads.yaml" \
    | grep -vE '^\s*#'
}

@test "rustdesk-client: downloads uses the \${PROD_DOMAIN} pattern in prod (like docs)" {
  grep -q 'downloads\.${PROD_DOMAIN}' "${REPO_ROOT}/prod/configmap-domains.yaml"
  grep -q 'downloads\.${PROD_DOMAIN}' "${REPO_ROOT}/prod/ingress.yaml"
}

@test "rustdesk-client: downloads OIDC client is seeded in Pocket ID" {
  grep -q 'downloads|SECRET_downloads' "${REPO_ROOT}/k3d/pocket-id-client-seed.yaml"
  grep -q 'POCKET_ID_DOWNLOADS_SECRET' "${REPO_ROOT}/environments/schema.yaml"
}

@test "rustdesk-client: build workflow is workflow_dispatch-only, no push trigger (REQ-004)" {
  [ -f "$WORKFLOW" ]
  grep -qE '^\s*workflow_dispatch:' "$WORKFLOW"
  # No push: trigger anywhere in the on: block.
  ! grep -qE '^\s*push:' "$WORKFLOW"
}

@test "rustdesk-client: MSI is never uploaded as a workflow artifact (REQ-003)" {
  [ -f "$WORKFLOW" ]
  ! grep -qE 'actions/upload-artifact|upload-release-asset|softprops/action-gh-release' "$WORKFLOW"
}

@test "rustdesk-client: workflow hard-fails if downloads-content package is public (REQ-003 backstop)" {
  [ -f "$WORKFLOW" ]
  grep -q 'Verify downloads-content package is private' "$WORKFLOW"
  grep -q "visibility.*!=.*private" "$WORKFLOW"
}

@test "rustdesk-client: official RustDesk MSI is version+SHA256 pinned" {
  [ -f "$WORKFLOW" ]
  grep -qE 'RUSTDESK_MSI_SHA256:\s*"[0-9a-f]{64}"' "$WORKFLOW"
  grep -qE 'RUSTDESK_MSI_URL:.*rustdesk.*\.msi' "$WORKFLOW"
}

# ── hbbs subPath Secret-Rotation runbook (T001382) ────────────────────────
# SSOT: openspec/specs/rustdesk-server.md, REQ-RUSTDESK-RELAY-006.
# subPath-mounted Secret files do not live-update in a running pod (documented
# kubelet limitation); rotating rustdesk-secrets requires a manual rollout
# restart. These tests guard the runbook's premise (hbbs.yaml still uses
# subPath) and the runbook's presence in the SSOT spec.

@test "rustdesk: hbbs keypair mount still uses subPath (runbook premise guard)" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  out="$(kustomize build "$STACK")"
  echo "$out" | grep -qE 'subPath:[[:space:]]*id_ed25519$'
  echo "$out" | grep -qE 'subPath:[[:space:]]*id_ed25519\.pub$'
}

@test "rustdesk: Secret-Rotation-Runbook documents manual rollout restart for hbbs" {
  spec="${REPO_ROOT}/openspec/specs/rustdesk-server.md"
  [ -f "$spec" ]
  grep -q 'REQ-RUSTDESK-RELAY-006' "$spec"
  grep -q 'rollout restart deployment/hbbs' "$spec"
}

@test "rustdesk-client: WiX wrapper source is well-formed XML" {
  command -v python3 >/dev/null || skip "python3 not installed"
  python3 -c "import xml.dom.minidom as m; m.parse('${REPO_ROOT}/rustdesk-installer/Bundle.wxs')"
  python3 -c "import xml.dom.minidom as m; m.parse('${REPO_ROOT}/rustdesk-installer/rustdesk-installer.wixproj')"
}

@test "rustdesk-client: provision.cmd keeps secret placeholders (no committed secret)" {
  grep -q '__RUSTDESK_CONFIG__' "${REPO_ROOT}/rustdesk-installer/provision.cmd"
  grep -q '__RUSTDESK_PASSWORD__' "${REPO_ROOT}/rustdesk-installer/provision.cmd"
}
