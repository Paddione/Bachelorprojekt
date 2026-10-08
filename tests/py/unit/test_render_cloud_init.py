"""Tests for scripts/hetzner/render-cloud-init.sh (migrated from tests/unit/render-cloud-init.bats)."""

from pathlib import Path
import pytest


@pytest.fixture
def cloud_init_fixtures(tmp_path: Path):
    versions_file = tmp_path / "versions.yaml"
    versions_file.write_text(
        "k3s: v9.99.0+k3s1\nsealed_secrets_chart: 9.1.0\ncert_manager: v9.2.0\nlonghorn_chart: 9.3.0\n"
    )

    template_file = tmp_path / "tpl.yaml"
    template_file.write_text(
        "#cloud-config\n# rendered: NODE_IP=${NODE_IP} K3S_VERSION=${K3S_VERSION} K3S_URL=${K3S_URL}\n"
        "ssh_authorized_keys:\n  - ${SSH_PUBLIC_KEY}\n"
    )

    base_args = [
        "--versions-file",
        str(versions_file),
        "--template",
        str(template_file),
        "--node-ip",
        "1.2.3.4",
        "--wg-listen-port",
        "51820",
        "--k3s-url",
        "https://192.168.100.1:6443",
        "--k3s-token",
        "testtoken",
        "--ssh-key",
        "ssh-ed25519 AAAA testkey",
    ]
    return versions_file, template_file, base_args


def test_render_cloud_init_substitutions(repo_root: Path, run_cmd, cloud_init_fixtures):
    _, _, base_args = cloud_init_fixtures
    script = repo_root / "scripts" / "hetzner" / "render-cloud-init.sh"

    res = run_cmd(["bash", str(script), *base_args])
    assert res.returncode == 0
    assert "NODE_IP=1.2.3.4" in res.stdout
    assert "K3S_VERSION=v9.99.0+k3s1" in res.stdout
    assert "K3S_URL=https://192.168.100.1:6443" in res.stdout
    assert "ssh-ed25519 AAAA testkey" in res.stdout
    assert res.stdout.strip().startswith("#cloud-config")


def test_render_cloud_init_failures_on_missing_args(repo_root: Path, run_cmd, cloud_init_fixtures):
    versions_file, template_file, _ = cloud_init_fixtures
    script = repo_root / "scripts" / "hetzner" / "render-cloud-init.sh"

    # missing node-ip
    res = run_cmd(
        [
            "bash",
            str(script),
            "--versions-file",
            str(versions_file),
            "--template",
            str(template_file),
            "--k3s-url",
            "https://192.168.100.1:6443",
            "--k3s-token",
            "testtoken",
            "--ssh-key",
            "ssh-ed25519 AAAA testkey",
        ]
    )
    assert res.returncode != 0
    assert "node-ip" in res.stdout or "node-ip" in res.stderr

    # missing versions file
    res = run_cmd(
        [
            "bash",
            str(script),
            "--versions-file",
            "/nonexistent/versions.yaml",
            "--template",
            str(template_file),
            "--node-ip",
            "1.2.3.4",
            "--wg-listen-port",
            "51820",
            "--k3s-url",
            "https://192.168.100.1:6443",
            "--k3s-token",
            "testtoken",
            "--ssh-key",
            "ssh-ed25519 AAAA testkey",
        ]
    )
    assert res.returncode != 0

    # missing template file
    res = run_cmd(
        [
            "bash",
            str(script),
            "--versions-file",
            str(versions_file),
            "--template",
            "/nonexistent/tpl.yaml",
            "--node-ip",
            "1.2.3.4",
            "--wg-listen-port",
            "51820",
            "--k3s-url",
            "https://192.168.100.1:6443",
            "--k3s-token",
            "testtoken",
            "--ssh-key",
            "ssh-ed25519 AAAA testkey",
        ]
    )
    assert res.returncode != 0
