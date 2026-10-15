"""Native assertions from tests/spec/ci-cd/spec-shard-optimization.bats."""

import yaml


def _jobs(repo_root):
    return yaml.safe_load((repo_root / ".github/workflows/ci.yml").read_text())["jobs"]


def test_no_spec_job_runs_the_removed_ticket_mcp_tests(repo_root):
    """Der Ticket-MCP entfiel mit der Ticket-DB; kein Spec-Job darf ihn noch bauen oder testen."""
    jobs = _jobs(repo_root)
    for name in ("test-spec-fast", "test-spec-shard"):
        # Positiv-Anker: die Jobs existieren und haben Schritte.
        assert jobs[name]["steps"], name
        assert not any("ticket-mcp:" in step.get("run", "") for step in jobs[name]["steps"]), name
