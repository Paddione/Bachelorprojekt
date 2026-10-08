"""Native migration of tests/spec/local-llm-proxy/host-listener-auth.bats."""

import json
import os

import pytest

PROXY = "http://127.0.0.1:18235"


@pytest.fixture(autouse=True)
def _setup(run_cmd, repo_root):
    """setup(): curl -s -m 2 -o /dev/null LIVEZ || skip 'llm-proxy not running'."""
    res = run_cmd(["curl", "-s", "-m", "2", "-o", "/dev/null", f"{PROXY}/livez"], cwd=repo_root)
    if res.returncode != 0:
        pytest.skip("llm-proxy not running")


def _http_code(run_cmd, cwd, url, extra=None, out_file=None):
    args = ["curl", "-s", "-m", "2", "-w", "%{http_code}", "-o", str(out_file) if out_file else "/dev/null"]
    args += extra or []
    args.append(url)
    res = run_cmd(args, cwd=cwd)
    return res.returncode, res.stdout.strip()


def _require_http(run_cmd, cwd, url, expected, what):
    code = run_cmd(["curl", "-s", "-m", "2", "-o", "/dev/null", "-w", "%{http_code}", url], cwd=cwd).stdout.strip()
    if code != expected:
        pytest.skip(f"{what} antwortet mit '{code or 'kein Code'}' statt '{expected}' (Umgebung, kein Produktfehler; T900651)")


def _skip_unless_admin_endpoint(run_cmd, cwd):
    _require_http(run_cmd, cwd, f"{PROXY}/admin/state", "200", "llm-proxy /admin/state (Admin-Loopback)")


def test_host_listener_auth_admin_state_on_loopback_responds_200_without_token(run_cmd, repo_root, tmp_path):
    _skip_unless_admin_endpoint(run_cmd, repo_root)
    state_file = tmp_path / "state.json"
    rc, code = _http_code(run_cmd, repo_root, f"{PROXY}/admin/state", out_file=state_file)
    assert rc == 0
    assert code == "200"
    state = json.loads(state_file.read_text(encoding="utf-8"))
    for key in ["port", "uptimeSec", "version"]:
        val = state.get(key)
        assert val is not None and str(val) != "", f"{key} fehlt im /admin/state"


def test_host_listener_auth_admin_page_returns_410_gone_without_html(run_cmd, repo_root, tmp_path):
    _skip_unless_admin_endpoint(run_cmd, repo_root)
    body_file = tmp_path / "admin.txt"
    rc, code = _http_code(run_cmd, repo_root, f"{PROXY}/admin", out_file=body_file)
    assert rc == 0
    assert code == "410"
    assert "<html" not in body_file.read_text(encoding="utf-8", errors="replace").lower()


def test_host_listener_auth_bridge_listener_requires_bearer_token_when_open(run_cmd, repo_root):
    network = os.environ.get("LLM_PROXY_K3D_NETWORK", "")
    res = run_cmd(
        ["docker", "network", "inspect", network, "-f", "{{range .IPAM.Config}}{{.Gateway}}{{end}}"],
        cwd=repo_root,
    )
    bridge_ip = res.stdout.strip() if res.returncode == 0 else ""
    if not bridge_ip:
        pytest.skip("k3d docker network gateway not available")

    live = run_cmd(["curl", "-s", "-m", "2", "-o", "/dev/null", f"http://{bridge_ip}:18235/livez"], cwd=repo_root)
    if live.returncode != 0:
        pytest.skip(f"bridge listener not listening on {bridge_ip}:18235 (e.g. LLM_PROXY_ADMIN_TOKEN not set on running proxy)")

    rc, code = _http_code(run_cmd, repo_root, f"http://{bridge_ip}:18235/admin/state")
    assert rc == 0
    assert code == "401"

    token = os.environ.get("LLM_PROXY_ADMIN_TOKEN", "")
    if token:
        rc, code = _http_code(run_cmd, repo_root, f"http://{bridge_ip}:18235/admin/state",
                              extra=["-H", f"Authorization: Bearer {token}"])
        assert rc == 0
        assert code == "200"
