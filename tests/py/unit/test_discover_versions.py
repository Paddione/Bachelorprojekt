"""Tests for scripts/discover-versions.sh (migrated from tests/unit/discover-versions.bats)."""

from pathlib import Path
import pytest


@pytest.fixture
def mock_curl_and_helm(tmp_path: Path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()

    curl_mock = bin_dir / "curl"
    curl_mock.write_text(
        "#!/usr/bin/env bash\n"
        'for arg in "$@"; do\n'
        '  if [[ "$arg" == *"k3s-io/k3s"* ]]; then\n'
        '    echo \'{"tag_name":"v1.99.0+k3s1"}\'\n'
        "    exit 0\n"
        "  fi\n"
        "done\n"
        "echo '{}'\n"
    )
    curl_mock.chmod(0o755)

    helm_mock = bin_dir / "helm"
    helm_mock.write_text(
        "#!/usr/bin/env bash\n"
        'case "${1:-}" in\n'
        "  repo) exit 0 ;;\n"
        "  search)\n"
        '    case "${3:-}" in\n'
        "      sealed-secrets/sealed-secrets) echo '[{\"version\":\"9.1.0\"}]' ;;\n"
        "      jetstack/cert-manager)         echo '[{\"version\":\"v9.2.0\"}]' ;;\n"
        "      longhorn/longhorn)             echo '[{\"version\":\"9.3.0\"}]' ;;\n"
        "      *)                             echo '[]' ;;\n"
        "    esac ;;\n"
        "esac\n"
    )
    helm_mock.chmod(0o755)

    import os
    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"
    return env


def test_dry_run_prints_discovered_versions(repo_root: Path, run_cmd, mock_curl_and_helm: dict[str, str]):
    script = repo_root / "scripts" / "discover-versions.sh"
    res = run_cmd(["bash", str(script)], env=mock_curl_and_helm)
    assert res.returncode == 0
    assert "k3s: v1.99.0+k3s1" in res.stdout
    assert "sealed_secrets_chart: 9.1.0" in res.stdout
    assert "cert_manager: v9.2.0" in res.stdout
    assert "longhorn_chart: 9.3.0" in res.stdout
    assert "flux:" not in res.stdout


def test_dry_run_does_not_write_file(repo_root: Path, run_cmd, mock_curl_and_helm: dict[str, str], tmp_path: Path):
    script = repo_root / "scripts" / "discover-versions.sh"
    versions_file = tmp_path / "versions.yaml"
    res = run_cmd(["bash", str(script), "--versions-file", str(versions_file)], env=mock_curl_and_helm)
    assert res.returncode == 0
    assert not versions_file.exists()


def test_update_writes_versions_yaml(repo_root: Path, run_cmd, mock_curl_and_helm: dict[str, str], tmp_path: Path):
    script = repo_root / "scripts" / "discover-versions.sh"
    versions_file = tmp_path / "versions.yaml"
    res = run_cmd(["bash", str(script), "--update", "--versions-file", str(versions_file)], env=mock_curl_and_helm)
    assert res.returncode == 0
    assert versions_file.exists()

    content = versions_file.read_text()
    assert "k3s: v1.99.0+k3s1" in content
    assert "sealed_secrets_chart: 9.1.0" in content
    assert "cert_manager: v9.2.0" in content
    assert "longhorn_chart: 9.3.0" in content
    assert "flux:" not in content
    assert "discover-versions.sh" in content.splitlines()[0]


def test_exits_nonzero_when_curl_empty_tag(repo_root: Path, run_cmd, mock_curl_and_helm: dict[str, str], tmp_path: Path):
    bin_dir = Path(mock_curl_and_helm["PATH"].split(":")[0])
    curl_mock = bin_dir / "curl"
    curl_mock.write_text("#!/usr/bin/env bash\necho '{\"tag_name\":\"\"}'\n")
    curl_mock.chmod(0o755)

    script = repo_root / "scripts" / "discover-versions.sh"
    res = run_cmd(["bash", str(script)], env=mock_curl_and_helm)
    assert res.returncode != 0
    assert "ERROR" in res.stdout or "ERROR" in res.stderr
