#!/usr/bin/env bats
# tests/unit/k3d-wait-auth-guard.bats
# Regression guard for T900854: k3d_wait and _bootstrap_keycloak_user must not
# block or wait unconditionally on Keycloak when no Keycloak deployment exists.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

@test "T900854: k3d_wait skips Keycloak wait when keycloak deployment is absent" {
  run bash -c "
    source '$REPO_ROOT/tests/lib/k3d.sh'

    # Mock kubectl and curl
    kubectl() {
      if [[ \"\$1\" == \"cluster-info\" ]]; then return 0; fi
      if [[ \"\$1\" == \"get\" && \"\$2\" == \"pods\" ]]; then return 0; fi
      if [[ \"\$1\" == \"get\" && \"\$2\" == \"deployment\" && \"\$3\" == \"keycloak\" ]]; then return 1; fi
      if [[ \"\$1\" == \"get\" && \"\$2\" == \"deployment\" && \"\$3\" == \"pocket-id\" ]]; then return 1; fi
      return 0
    }
    _start_nc_portforward() { :; }
    _wait_for_url() { echo \"CALLED_WAIT_FOR_URL: \$*\"; }

    k3d_wait
  "

  echo "output: $output"
  [ "$status" -eq 0 ]
  [[ "$output" != *"CALLED_WAIT_FOR_URL"* ]]
  [[ "$output" == *"Kein Auth-Deployment"* ]]
}

@test "T900854: k3d_wait waits for Pocket ID when pocket-id deployment is present" {
  run bash -c "
    source '$REPO_ROOT/tests/lib/k3d.sh'

    kubectl() {
      if [[ \"\$1\" == \"cluster-info\" ]]; then return 0; fi
      if [[ \"\$1\" == \"get\" && \"\$2\" == \"pods\" ]]; then return 0; fi
      if [[ \"\$1\" == \"get\" && \"\$2\" == \"deployment\" && \"\$3\" == \"keycloak\" ]]; then return 1; fi
      if [[ \"\$1\" == \"get\" && \"\$2\" == \"deployment\" && \"\$3\" == \"pocket-id\" ]]; then return 0; fi
      return 0
    }
    _start_nc_portforward() { :; }
    _wait_for_url() { echo \"CALLED_WAIT_FOR_URL: \$*\"; }

    k3d_wait
  "

  echo "output: $output"
  [ "$status" -eq 0 ]
  [[ "$output" == *"CALLED_WAIT_FOR_URL: http://auth.localhost/.well-known/openid-configuration Pocket ID 60"* ]]
}

@test "T900854: k3d_wait waits for Keycloak when keycloak deployment is present" {
  run bash -c "
    source '$REPO_ROOT/tests/lib/k3d.sh'

    kubectl() {
      if [[ \"\$1\" == \"cluster-info\" ]]; then return 0; fi
      if [[ \"\$1\" == \"get\" && \"\$2\" == \"pods\" ]]; then return 0; fi
      if [[ \"\$1\" == \"get\" && \"\$2\" == \"deployment\" && \"\$3\" == \"keycloak\" ]]; then return 0; fi
      return 1
    }
    _start_nc_portforward() { :; }
    _wait_for_url() { echo \"CALLED_WAIT_FOR_URL: \$*\"; }

    k3d_wait
  "

  echo "output: $output"
  [ "$status" -eq 0 ]
  [[ "$output" == *"CALLED_WAIT_FOR_URL: http://auth.localhost/health/ready Keycloak 180"* ]]
}

@test "T900854: _bootstrap_keycloak_user skips cleanly when keycloak deployment is absent" {
  run bash -c "
    source '$REPO_ROOT/tests/lib/k3d.sh'

    kubectl() {
      if [[ \"\$1\" == \"get\" && \"\$2\" == \"deployment\" && \"\$3\" == \"keycloak\" ]]; then return 1; fi
      return 0
    }
    _kc_admin_login() { echo \"SHOULD_NOT_BE_CALLED\"; }

    _bootstrap_keycloak_user
  "

  echo "output: $output"
  [ "$status" -eq 0 ]
  [[ "$output" != *"SHOULD_NOT_BE_CALLED"* ]]
  [[ "$output" == *"Kein Keycloak-Deployment"* ]]
}
