"""Native migration of tests/unit/k3d-wait-auth-guard.bats."""
from pathlib import Path

import pytest

PREAMBLE = """
    source '__REPO__/tests/lib/k3d.sh'
"""

KUBECTL_NO_KEYCLOAK_NO_POCKETID = r"""
    kubectl() {
      if [[ "$1" == "cluster-info" ]]; then return 0; fi
      if [[ "$1" == "get" && "$2" == "pods" ]]; then return 0; fi
      if [[ "$1" == "get" && "$2" == "deployment" && "$3" == "keycloak" ]]; then return 1; fi
      if [[ "$1" == "get" && "$2" == "deployment" && "$3" == "pocket-id" ]]; then return 1; fi
      return 0
    }
    _start_nc_portforward() { :; }
    _wait_for_url() { echo "CALLED_WAIT_FOR_URL: $*"; }

    k3d_wait
"""

KUBECTL_POCKETID_ONLY = r"""
    kubectl() {
      if [[ "$1" == "cluster-info" ]]; then return 0; fi
      if [[ "$1" == "get" && "$2" == "pods" ]]; then return 0; fi
      if [[ "$1" == "get" && "$2" == "deployment" && "$3" == "keycloak" ]]; then return 1; fi
      if [[ "$1" == "get" && "$2" == "deployment" && "$3" == "pocket-id" ]]; then return 0; fi
      return 0
    }
    _start_nc_portforward() { :; }
    _wait_for_url() { echo "CALLED_WAIT_FOR_URL: $*"; }

    k3d_wait
"""

KUBECTL_KEYCLOAK_PRESENT = r"""
    kubectl() {
      if [[ "$1" == "cluster-info" ]]; then return 0; fi
      if [[ "$1" == "get" && "$2" == "pods" ]]; then return 0; fi
      if [[ "$1" == "get" && "$2" == "deployment" && "$3" == "keycloak" ]]; then return 0; fi
      return 1
    }
    _start_nc_portforward() { :; }
    _wait_for_url() { echo "CALLED_WAIT_FOR_URL: $*"; }

    k3d_wait
"""

BOOTSTRAP_NO_KEYCLOAK = r"""
    kubectl() {
      if [[ "$1" == "get" && "$2" == "deployment" && "$3" == "keycloak" ]]; then return 1; fi
      return 0
    }
    _kc_admin_login() { echo "SHOULD_NOT_BE_CALLED"; }

    _bootstrap_keycloak_user
"""


def _script(repo_root: Path, body: str) -> list:
    text = (PREAMBLE + body).replace("__REPO__", str(repo_root))
    return ["bash", "-c", text]


def test_t900854_k3d_wait_skips_keycloak_wait_when_keycloak_deployment_is_absent(run_cmd, repo_root):
    result = run_cmd(_script(repo_root, KUBECTL_NO_KEYCLOAK_NO_POCKETID))
    assert result.returncode == 0, result.output
    assert "CALLED_WAIT_FOR_URL" not in result.output
    assert "Kein Auth-Deployment" in result.output


def test_t900854_k3d_wait_waits_for_pocket_id_when_pocket_id_deployment_is_present(run_cmd, repo_root):
    result = run_cmd(_script(repo_root, KUBECTL_POCKETID_ONLY))
    assert result.returncode == 0, result.output
    assert "CALLED_WAIT_FOR_URL: http://auth.localhost/.well-known/openid-configuration Pocket ID 60" in result.output


def test_t900854_k3d_wait_waits_for_keycloak_when_keycloak_deployment_is_present(run_cmd, repo_root):
    result = run_cmd(_script(repo_root, KUBECTL_KEYCLOAK_PRESENT))
    assert result.returncode == 0, result.output
    assert "CALLED_WAIT_FOR_URL: http://auth.localhost/health/ready Keycloak 180" in result.output


def test_t900854_bootstrap_keycloak_user_skips_cleanly_when_keycloak_deployment_is_absent(run_cmd, repo_root):
    result = run_cmd(_script(repo_root, BOOTSTRAP_NO_KEYCLOAK))
    assert result.returncode == 0, result.output
    assert "SHOULD_NOT_BE_CALLED" not in result.output
    assert "Kein Keycloak-Deployment" in result.output
