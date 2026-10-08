"""tests/py/smoke/test_harness.py — Verification of pytest harness fixtures."""
from pathlib import Path


def test_repo_root_fixture(repo_root: Path):
    """Verify repo_root fixture points to a valid repository root."""
    assert repo_root.is_dir()
    assert (repo_root / "taskfiles" / "Taskfile.test.yml").is_file()
    assert (repo_root / ".git").exists()


def test_run_cmd_fixture(run_cmd):
    """Verify run_cmd fixture executes commands and returns structured output."""
    res = run_cmd("git --version")
    res.check(0)
    assert "git version" in res.stdout


def test_yaml_load_fixture(yaml_load, repo_root: Path):
    """Verify yaml_load fixture safely parses YAML content and files."""
    doc = yaml_load("name: pytest-harness\nenabled: true\nitems: [1, 2, 3]")
    assert doc["name"] == "pytest-harness"
    assert doc["enabled"] is True
    assert doc["items"] == [1, 2, 3]
