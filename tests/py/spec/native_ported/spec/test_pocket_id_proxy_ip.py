"""Native migration of tests/spec/pocket-id-proxy-ip.bats."""

# T001328 added `spec.forwardedHeaders.trustedIPs` to the Pocket-ID
# IngressRoute to fix Pocket-ID's rate-limiter/audit-log seeing the
# cluster-internal proxy IP instead of the real client IP. That field was
# placed on the wrong CRD object: `forwardedHeaders` has never been a valid
# `IngressRoute` field for any Traefik version (confirmed against the live
# `fleet` cluster's installed `ingressroutes.traefik.io` CRD, which only
# declares `entryPoints`, `parentRefs`, `routes`, `tls`) — it only exists as
# Traefik's static/entry-point config. `kubectl apply --server-side` (used by
# `task workspace:deploy`) validates against that schema and rejected the
# field, aborting the whole apply chain and blocking every future deploy to
# both brands (T001397).
#
# Separately, T001341 (traefik-hostport-clientip) already fixed the
# underlying problem this field was chasing: Traefik now binds hostPort
# 80/443 directly with klipper-lb removed, so there is no SNAT hop left to
# correct for — the real client IP already reaches Pocket-ID without needing
# to trust any upstream X-Forwarded-For header.
#
# This spec now verifies the field stays removed and the rendered manifest
# stays schema-clean, while TRUST_PROXY (Pocket-ID's own Express-level
# trust-proxy setting, unrelated to the Traefik CRD) remains required.

import shutil
import subprocess

import pytest


@pytest.fixture
def k3d(repo_root):
    return repo_root / "k3d"


def _ingressroute_has_forwarded_headers(manifest: str) -> bool:
    """Python port of the awk program: True if any IngressRoute document contains forwardedHeaders:."""
    in_ir = False
    found = False
    for line in manifest.splitlines():
        if line == "---":
            if in_ir and found:
                return True
            in_ir = False
            found = False
        elif line == "kind: IngressRoute":
            in_ir = True
        elif in_ir and "forwardedHeaders:" in line:
            found = True
    return found


def test_pocket_id_proxy_k3d_pocket_id_yaml_ingressroute_has_no_forwarded_headers(k3d):
    text = (k3d / "pocket-id.yaml").read_text(encoding="utf-8")
    assert "forwardedHeaders" not in text, "forwardedHeaders is an invalid IngressRoute CRD field"


def test_pocket_id_proxy_kustomize_build_k3d_emits_no_forwarded_headers_on_any_ingressroute(
    k3d, run_cmd
):
    if shutil.which("kustomize") is None:
        pytest.skip("kustomize not installed")
    result = run_cmd(
        ["kustomize", "build", str(k3d), "--load-restrictor=LoadRestrictionsNone"],
        timeout=300,
    )
    assert not _ingressroute_has_forwarded_headers(result.stdout), (
        "an IngressRoute in the rendered manifest still carries forwardedHeaders"
    )


def test_pocket_id_proxy_trust_proxy_env_is_set_accepts_x_forwarded_for(k3d):
    text = (k3d / "pocket-id.yaml").read_text(encoding="utf-8")
    assert "TRUST_PROXY" in text
