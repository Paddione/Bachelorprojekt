"""Native migration of tests/local/NFA-14-devcluster-ha.bats."""
import re
import shutil

import pytest


@pytest.fixture(autouse=True)
def devc_cluster(run_cmd):
    """Mirror the BATS setup(): skip every case when the devc cluster is unreachable."""
    if shutil.which("kubectl") is None:
        pytest.skip("kubectl not available")
    probe = run_cmd(["kubectl", "--context", "devc", "cluster-info"], timeout=300)
    if probe.returncode != 0:
        pytest.skip("devc cluster not reachable — skipping live cluster tests")


def test_devc_cluster_has_3_ready_nodes(run_cmd):
    r = run_cmd(["kubectl", "--context", "devc", "get", "nodes", "--no-headers"], timeout=300)
    assert r.returncode == 0
    ready = sum(1 for line in r.output.splitlines() if " Ready " in line)
    assert ready == 3


def test_shared_db_dev_longhorn_volume_is_healthy(run_cmd):
    r = run_cmd(
        ["kubectl", "--context", "devc", "-n", "longhorn-system", "get",
         "volumes.longhorn.io", "-o", "jsonpath={.items[*].status.robustness}"],
        timeout=300,
    )
    assert r.returncode == 0
    # Fail if any volume is degraded, faulted, or unknown (not just absent-of-healthy).
    assert re.search(r"degraded|faulted|unknown", r.output) is None
    assert "healthy" in r.output


def test_vip_serves_the_website_host(run_cmd):
    r = run_cmd(
        ["curl", "-sS", "-o", "/dev/null", "-w", "%{http_code}",
         "-H", "Host: web.dev.mentolder.de", "http://10.0.0.20/"],
        timeout=300,
    )
    assert r.returncode == 0
    assert re.fullmatch(r"200|301|302", r.output.strip()) is not None


def test_kube_vip_daemonset_is_running_on_all_nodes(run_cmd):
    r = run_cmd(
        ["kubectl", "--context", "devc", "-n", "kube-system", "get", "daemonset",
         "kube-vip-ds", "-o", "jsonpath={.status.numberReady}"],
        timeout=300,
    )
    assert r.returncode == 0
    assert r.output.strip() == "3"
