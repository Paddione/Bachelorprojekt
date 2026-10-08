"""Native assertions from tests/spec/ci-cd/spec-shard-optimization.bats."""

import yaml


def test_fast_spec_job_executes_ticket_mcp_tests(repo_root):
    job = yaml.safe_load((repo_root / ".github/workflows/ci.yml").read_text())["jobs"]["test-spec-fast"]
    assert any("ticket-mcp:test" in step.get("run", "") for step in job["steps"])


def test_sharded_spec_job_does_not_repeat_ticket_mcp_tests(repo_root):
    test_fast_spec_job_executes_ticket_mcp_tests(repo_root)
    job = yaml.safe_load((repo_root / ".github/workflows/ci.yml").read_text())["jobs"]["test-spec-shard"]
    assert job["steps"]
    assert not any("ticket-mcp:test" in step.get("run", "") for step in job["steps"])
