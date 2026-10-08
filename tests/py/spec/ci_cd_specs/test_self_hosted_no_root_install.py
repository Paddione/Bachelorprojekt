"""Native assertions from tests/spec/ci-cd/self-hosted-no-root-install.bats."""

import os
import re
import pytest
import yaml

@pytest.fixture
def hosted(repo_root):
    jobs = [(file.name, job) for suffix in ["*.yml", "*.yaml"] for file in (repo_root / ".github/workflows").glob(suffix) for job in yaml.safe_load(file.read_text()).get("jobs", {}).values() if "self-hosted" in str(job.get("runs-on", ""))]
    return jobs


def run_lines(hosted):
    return [(file, line) for file, job in hosted for step in job.get("steps", []) for line in step.get("run", "").splitlines() if not re.match(r"\s*#", line)]


def test_self_hosted_run_steps_positive_anchor(hosted):
    assert hosted
    assert any(line for _, line in run_lines(hosted))


def test_no_sudo_except_noninteractive_probe(hosted):
    test_self_hosted_run_steps_positive_anchor(hosted)
    bad = [(file, line) for file, line in run_lines(hosted) if "sudo" in line and "sudo -n" not in line]
    assert not bad, bad


def test_no_installation_to_root_binary_dirs(hosted):
    test_self_hosted_run_steps_positive_anchor(hosted)
    bad = [(file, line) for file, line in run_lines(hosted) if re.search(r'(-o|-C|install .*|mv .*|cp .*)\s+"?/usr/(local/)?bin', line)]
    assert not bad, bad


def test_no_root_cache_paths(hosted):
    test_self_hosted_run_steps_positive_anchor(hosted)
    paths = [(file, line) for file, job in hosted for step in job.get("steps", []) if "actions/cache" in step.get("uses", "") for line in step.get("with", {}).get("path", "").splitlines() if line]
    assert not [(file, path) for file, path in paths if path.startswith(("/usr/", "/opt/", "/etc/"))]


def test_provision_script_executable_and_valid(repo_root, run_cmd):
    script = repo_root / "scripts/ci/provision-gh-runner.sh"
    assert script.is_file()
    assert os.access(script, os.X_OK)
    run_cmd(["bash", "-n", str(script)]).check()


def test_provision_check_mode_reports_without_installing(repo_root, run_cmd):
    script = repo_root / "scripts/ci/provision-gh-runner.sh"
    assert "--check" in script.read_text()
    result = run_cmd(["bash", str(script), "--check"])
    assert result.returncode in [0, 1], result.output
    assert "provision-gh-runner" in result.output
