"""Native assertions from tests/spec/ci-cd/arbitration-scoped-kubeconfig.bats."""

import pytest
import yaml

@pytest.fixture
def job(repo_root):
    workflow = yaml.safe_load((repo_root / ".github/workflows/arbitration.yml").read_text())
    return workflow["jobs"]["arbitrate"]


def test_arbitrate_job_has_steps(job):
    assert "steps" in job


def test_secret_bound_at_job_level(job):
    assert "secrets.ARBITRATION_KUBECONFIG" in job["env"]["ARBITRATION_KUBECONFIG"]


def test_kubeconfig_condition_uses_env_without_secrets(job):
    condition = next(step for step in job["steps"] if step.get("name") == "Provide scoped kubeconfig for ticket escalation")["if"]
    assert "env.ARBITRATION_KUBECONFIG" in condition
    assert "secrets." not in condition


def test_kubeconfig_cleanup_runs_always(job):
    condition = next(step for step in job["steps"] if step.get("name") == "Shred scoped kubeconfig")["if"]
    assert "always" in condition
