#!/usr/bin/env bats
# discover-versions.bats — unit tests for scripts/discover-versions.sh

load test_helper

SCRIPT="${PROJECT_DIR}/scripts/discover-versions.sh"

setup() {
  TMPDIR=$(mktemp -d)
  VERSIONS_FILE="${TMPDIR}/versions.yaml"
}

teardown() {
  rm -rf "$TMPDIR"
}

# Mock curl to return fixture GitHub API responses without network calls
_mock_curl() {
  curl() {
    local args="$*"
    if [[ "$args" == *"k3s-io/k3s"* ]]; then
      echo '{"tag_name":"v1.99.0+k3s1"}'
    else
      echo '{}'
    fi
  }
  export -f curl
}

# Mock helm to return fixture search results without real repos
_mock_helm() {
  helm() {
    case "${1:-}" in
      repo) return 0 ;;
      search)
        case "${3:-}" in
          sealed-secrets/sealed-secrets) echo '[{"version":"9.1.0"}]' ;;
          jetstack/cert-manager)         echo '[{"version":"v9.2.0"}]' ;;
          longhorn/longhorn)             echo '[{"version":"9.3.0"}]' ;;
          *)                             echo '[]' ;;
        esac
        ;;
    esac
  }
  export -f helm
}

@test "dry run prints all discovered versions" {
  _mock_curl
  _mock_helm
  run bash "$SCRIPT"
  assert_success
  assert_output --partial "k3s: v1.99.0+k3s1"
  assert_output --partial "sealed_secrets_chart: 9.1.0"
  assert_output --partial "cert_manager: v9.2.0"
  assert_output --partial "longhorn_chart: 9.3.0"
  # Flux is no longer installed/tracked (fleet is push-based, no GitOps controller).
  refute_output --partial "flux:"
}

@test "dry run does not write a file" {
  _mock_curl
  _mock_helm
  run bash "$SCRIPT"
  assert_success
  [ ! -f "$VERSIONS_FILE" ]
}

@test "--update writes versions.yaml with all required keys" {
  _mock_curl
  _mock_helm
  run bash "$SCRIPT" --update --versions-file "$VERSIONS_FILE"
  assert_success
  assert [ -f "$VERSIONS_FILE" ]
  run grep "^k3s:" "$VERSIONS_FILE";               assert_success
  run grep "^sealed_secrets_chart:" "$VERSIONS_FILE"; assert_success
  run grep "^cert_manager:" "$VERSIONS_FILE";      assert_success
  run grep "^longhorn_chart:" "$VERSIONS_FILE";    assert_success
  run grep "^flux:" "$VERSIONS_FILE";              assert_failure  # flux no longer tracked
}

@test "--update writes correct discovered values" {
  _mock_curl
  _mock_helm
  bash "$SCRIPT" --update --versions-file "$VERSIONS_FILE"
  run grep "^k3s:" "$VERSIONS_FILE"
  assert_output "k3s: v1.99.0+k3s1"
  run grep "^longhorn_chart:" "$VERSIONS_FILE"
  assert_output "longhorn_chart: 9.3.0"
}

@test "versions.yaml has managed-by comment on first line" {
  _mock_curl
  _mock_helm
  bash "$SCRIPT" --update --versions-file "$VERSIONS_FILE"
  run head -1 "$VERSIONS_FILE"
  assert_output --partial "discover-versions.sh"
}

@test "exits non-zero when curl returns empty tag_name" {
  curl() { echo '{"tag_name":""}'; }
  export -f curl
  helm() { case "${1:-}" in repo) return 0;; search) echo '[{"version":"1.0.0"}]';; esac; }
  export -f helm
  run bash "$SCRIPT"
  assert_failure
  assert_output --partial "ERROR"
}
