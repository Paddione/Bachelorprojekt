"""Native assertions from tests/spec/ci-cd/brainstorm-firewall-namespace.bats."""

import pytest

@pytest.mark.parametrize("task", ["brainstorm:firewall:open", "brainstorm:setup"])
def test_cross_include_firewall_delegation(run_cmd, task):
    result = run_cmd(["task", task, "--dry"])
    result.check()
    assert "ufw reload" in result.output
    assert "does not exist" not in result.output
