"""Native assertions from tests/spec/ci-cd/hybrid-runner-placement.bats."""

import pytest
import yaml

PORTABLE = ["test-bats", "test-manifests", "test-spec-fast", "test-spec-shard", "test-spec", "security-scan", "brett-typescript", "vitest-website", "lighthouse", "commit-lint"]
AUXILIARY = [("auto-enable-automerge", "enable-automerge"), ("e2e-pr", "e2e-pr"), ("pr-auto-title", "auto-title")]

@pytest.fixture
def workflows(repo_root):
    return {file.stem: yaml.safe_load(file.read_text())["jobs"] for file in (repo_root / ".github/workflows").glob("*.yml")}


def test_portable_core_jobs_ubuntu(workflows):
    for job in PORTABLE:
        assert workflows["ci"][job]["runs-on"] == "ubuntu-latest", job


def test_portable_pr_helpers_ubuntu(workflows):
    for file, job in AUXILIARY:
        assert workflows[file][job]["runs-on"] == "ubuntu-latest", (file, job)


def test_portable_core_not_globally_fork_blocked(workflows):
    for job in PORTABLE:
        assert "github.repository" not in str(workflows["ci"][job].get("if", "")), job


def test_secret_write_helpers_keep_trust_guard(workflows):
    for file, job in AUXILIARY:
        assert "github.repository" in workflows[file][job].get("if", ""), (file, job)


def test_local_llm_jobs_keep_capability(workflows):
    for file, job in [("opencode", "opencode"), ("arbitration", "arbitrate")]:
        runner = workflows[file][job]["runs-on"]
        assert "self-hosted" in runner
        assert "fleet-gpu" in runner


def test_required_check_names_stable(workflows):
    expected = {"test-bats": "Unit + Quality Gates", "test-manifests": "Manifest Validation", "test-spec": "Spec + Guards", "vitest-website": "Vitest (website)", "commit-lint": "Conventional Commits"}
    for job, name in expected.items():
        assert workflows["ci"][job]["name"] == name
    assert workflows["e2e-pr"]["e2e-pr"]["name"] == "E2E PR"
