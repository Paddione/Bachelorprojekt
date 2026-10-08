"""Native migration of tests/unit/render-cloud-init.bats."""
from pathlib import Path

import pytest


@pytest.fixture
def tmpdir_files(tmp_path):
    """Port of setup(): minimal versions.yaml and cloud-init template fixtures."""
    (tmp_path / "versions.yaml").write_text(
        "k3s: v9.99.0+k3s1\n"
        "sealed_secrets_chart: 9.1.0\n"
        "cert_manager: v9.2.0\n"
        "longhorn_chart: 9.3.0\n"
    )
    (tmp_path / "tpl.yaml").write_text(
        "#cloud-config\n"
        "# rendered: NODE_IP=${NODE_IP} K3S_VERSION=${K3S_VERSION} K3S_URL=${K3S_URL}\n"
        "ssh_authorized_keys:\n"
        "  - ${SSH_PUBLIC_KEY}\n"
    )
    return tmp_path


@pytest.fixture
def script(repo_root):
    path = repo_root / "scripts" / "hetzner" / "render-cloud-init.sh"
    return str(path)


def _base_args(d: Path):
    # Mirrors the BATS helper `$(_base_args)`, whose unquoted expansion word-splits
    # the --ssh-key value into three words.
    text = (
        f"--versions-file {d / 'versions.yaml'} "
        f"--template {d / 'tpl.yaml'} "
        "--node-ip 1.2.3.4 "
        "--wg-listen-port 51820 "
        "--k3s-url https://192.168.100.1:6443 "
        "--k3s-token testtoken "
        "--ssh-key ssh-ed25519 AAAA testkey"
    )
    return text.split()


def test_substitutes_node_ip(run_cmd, script, tmpdir_files):
    r = run_cmd(["bash", script, *_base_args(tmpdir_files)])
    assert r.returncode == 0, r.output
    assert "NODE_IP=1.2.3.4" in r.output


def test_substitutes_k3s_version_from_versions_yaml(run_cmd, script, tmpdir_files):
    r = run_cmd(["bash", script, *_base_args(tmpdir_files)])
    assert r.returncode == 0, r.output
    assert "K3S_VERSION=v9.99.0+k3s1" in r.output


def test_substitutes_k3s_url(run_cmd, script, tmpdir_files):
    r = run_cmd(["bash", script, *_base_args(tmpdir_files)])
    assert r.returncode == 0, r.output
    assert "K3S_URL=https://192.168.100.1:6443" in r.output


def test_substitutes_ssh_public_key(run_cmd, script, tmpdir_files):
    r = run_cmd(["bash", script, *_base_args(tmpdir_files)])
    assert r.returncode == 0, r.output
    assert "ssh-ed25519 AAAA testkey" in r.output


def test_output_starts_with_cloud_config(run_cmd, script, tmpdir_files):
    r = run_cmd(["bash", script, *_base_args(tmpdir_files)])
    assert r.returncode == 0, r.output
    assert "#cloud-config" in r.output


def test_fails_when_node_ip_is_missing(run_cmd, script, tmpdir_files):
    d = tmpdir_files
    r = run_cmd([
        "bash", script,
        "--versions-file", str(d / "versions.yaml"),
        "--template", str(d / "tpl.yaml"),
        "--k3s-url", "https://192.168.100.1:6443",
        "--k3s-token", "testtoken",
        "--ssh-key", "ssh-ed25519 AAAA testkey",
    ])
    assert r.returncode != 0, r.output
    assert "node-ip" in r.output


def test_fails_when_versions_file_does_not_exist(run_cmd, script, tmpdir_files):
    d = tmpdir_files
    r = run_cmd([
        "bash", script,
        "--versions-file", "/nonexistent/versions.yaml",
        "--template", str(d / "tpl.yaml"),
        "--node-ip", "1.2.3.4",
        "--wg-listen-port", "51820",
        "--k3s-url", "https://192.168.100.1:6443",
        "--k3s-token", "testtoken",
        "--ssh-key", "ssh-ed25519 AAAA testkey",
    ])
    assert r.returncode != 0, r.output
    assert "versions file" in r.output


def test_fails_when_template_does_not_exist(run_cmd, script, tmpdir_files):
    d = tmpdir_files
    r = run_cmd([
        "bash", script,
        "--versions-file", str(d / "versions.yaml"),
        "--template", "/nonexistent/tpl.yaml",
        "--node-ip", "1.2.3.4",
        "--wg-listen-port", "51820",
        "--k3s-url", "https://192.168.100.1:6443",
        "--k3s-token", "testtoken",
        "--ssh-key", "ssh-ed25519 AAAA testkey",
    ])
    assert r.returncode != 0, r.output
    assert "template" in r.output
