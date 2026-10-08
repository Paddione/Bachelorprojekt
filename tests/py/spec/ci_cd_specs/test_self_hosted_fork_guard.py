"""Native assertions from tests/spec/ci-cd/self-hosted-fork-guard.bats."""

import pytest
import yaml

@pytest.fixture
def workflows(repo_root):
    return {file.name: yaml.safe_load(file.read_text()) for suffix in ["*.yml", "*.yaml"] for file in (repo_root / ".github/workflows").glob(suffix)}


def hosted_jobs(workflow):
    return {name: job for name, job in workflow.get("jobs", {}).items() if "self-hosted" in str(job.get("runs-on", ""))}


def triggers(workflow):
    # PyYAML's YAML 1.1 resolver reads the Actions 'on' key as True.
    return workflow.get("on", workflow.get(True, {}))


def test_self_hosted_workflow_positive_anchor(workflows):
    assert any(hosted_jobs(workflow) for workflow in workflows.values())


def test_self_hosted_pr_jobs_have_fork_guard(workflows):
    test_self_hosted_workflow_positive_anchor(workflows)
    bad = []
    for file, workflow in workflows.items():
        if "pull_request" not in triggers(workflow):
            continue
        bad.extend((file, name) for name, job in hosted_jobs(workflow).items() if "github.repository" not in job.get("if", ""))
    assert not bad, bad


def test_arbitration_not_cron_or_pr_triggered(workflows):
    workflow = workflows["arbitration.yml"]
    assert "workflow_dispatch" in triggers(workflow)
    assert "schedule" not in triggers(workflow)
    assert "pull_request" not in triggers(workflow)


def test_arbitration_dispatch_available(workflows):
    assert "workflow_dispatch" in triggers(workflows["arbitration.yml"])
