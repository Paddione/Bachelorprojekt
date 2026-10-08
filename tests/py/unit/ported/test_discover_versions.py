"""Native migration of tests/unit/discover-versions.bats."""
import os
import stat

import pytest

MOCK_CURL = """#!/usr/bin/env bash
args="$*"
if [[ "$args" == *"k3s-io/k3s"* ]]; then
  echo '{"tag_name":"v1.99.0+k3s1"}'
else
  echo '{}'
fi
"""

MOCK_HELM = """#!/usr/bin/env bash
case "${1:-}" in
  repo) exit 0 ;;
  search)
    case "${3:-}" in
      sealed-secrets/sealed-secrets) echo '[{"version":"9.1.0"}]' ;;
      jetstack/cert-manager)         echo '[{"version":"v9.2.0"}]' ;;
      longhorn/longhorn)             echo '[{"version":"9.3.0"}]' ;;
      *)                             echo '[]' ;;
    esac
    ;;
esac
"""

MOCK_HELM_EMPTY_TAG = """#!/usr/bin/env bash
case "${1:-}" in
  repo) exit 0 ;;
  search) echo '[{"version":"1.0.0"}]' ;;
esac
"""

MOCK_CURL_EMPTY_TAG = """#!/usr/bin/env bash
echo '{"tag_name":""}'
"""


def _make_bin(bin_dir, name, content):
    path = bin_dir / name
    path.write_text(content, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


@pytest.fixture
def mocks(tmp_path):
    """Mock curl/helm als ausfuehrbare Stubs vorn im PATH (ersetzt die BATS-Shellfunktionen)."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()

    def _install(curl, helm):
        _make_bin(bin_dir, "curl", curl)
        _make_bin(bin_dir, "helm", helm)
        return {"PATH": f"{bin_dir}{os.pathsep}{os.environ.get('PATH', '')}"}

    return _install


@pytest.fixture
def script(repo_root):
    return str(repo_root / "scripts" / "discover-versions.sh")


@pytest.fixture
def versions_file(tmp_path):
    return tmp_path / "versions.yaml"


def _grep_lines(path, prefix):
    return [line for line in path.read_text(encoding="utf-8").splitlines() if line.startswith(prefix)]


def test_dry_run_prints_all_discovered_versions(run_cmd, script, mocks):
    env = mocks(MOCK_CURL, MOCK_HELM)
    r = run_cmd(["bash", script], env=env)
    r.check()
    assert "k3s: v1.99.0+k3s1" in r.output
    assert "sealed_secrets_chart: 9.1.0" in r.output
    assert "cert_manager: v9.2.0" in r.output
    assert "longhorn_chart: 9.3.0" in r.output
    # Flux wird nicht mehr installiert/getrackt (push-based fleet).
    assert "flux:" not in r.output


def test_dry_run_does_not_write_a_file(run_cmd, script, mocks, versions_file):
    env = mocks(MOCK_CURL, MOCK_HELM)
    r = run_cmd(["bash", script], env=env)
    r.check()
    assert not versions_file.exists()


def test_update_writes_versions_yaml_with_all_required_keys(run_cmd, script, mocks, versions_file):
    env = mocks(MOCK_CURL, MOCK_HELM)
    r = run_cmd(["bash", script, "--update", "--versions-file", str(versions_file)], env=env)
    r.check()
    assert versions_file.is_file()
    for prefix in ["k3s:", "sealed_secrets_chart:", "cert_manager:", "longhorn_chart:"]:
        assert _grep_lines(versions_file, prefix), f"missing key {prefix}"
    # flux ist nicht mehr getrackt.
    assert _grep_lines(versions_file, "flux:") == []


def test_update_writes_correct_discovered_values(run_cmd, script, mocks, versions_file):
    env = mocks(MOCK_CURL, MOCK_HELM)
    run_cmd(["bash", script, "--update", "--versions-file", str(versions_file)], env=env)
    assert "\n".join(_grep_lines(versions_file, "k3s:")) == "k3s: v1.99.0+k3s1"
    assert "\n".join(_grep_lines(versions_file, "longhorn_chart:")) == "longhorn_chart: 9.3.0"


def test_versions_yaml_has_managed_by_comment_on_first_line(run_cmd, script, mocks, versions_file):
    env = mocks(MOCK_CURL, MOCK_HELM)
    run_cmd(["bash", script, "--update", "--versions-file", str(versions_file)], env=env)
    first_line = versions_file.read_text(encoding="utf-8").splitlines()[0]
    assert "discover-versions.sh" in first_line


def test_exits_non_zero_when_curl_returns_empty_tag_name(run_cmd, script, mocks):
    env = mocks(MOCK_CURL_EMPTY_TAG, MOCK_HELM_EMPTY_TAG)
    r = run_cmd(["bash", script], env=env)
    assert r.returncode != 0
    assert "ERROR" in r.output
