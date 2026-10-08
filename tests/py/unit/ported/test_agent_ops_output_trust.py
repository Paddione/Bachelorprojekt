"""Native migration of tests/unit/agent-ops-output-trust.bats."""
import re

import pytest


@pytest.fixture
def agent_file(repo_root):
    return repo_root / ".claude/agents/bp-run.md"


def grep_ci(path, pattern):
    """grep -qiE: zeilenweise, Treffer in einer beliebigen Zeile."""
    regex = re.compile(pattern, re.IGNORECASE)
    return any(regex.search(ln) for ln in path.read_text(encoding="utf-8", errors="replace").splitlines())


def test_bp_run_agent_file_exists(agent_file):
    assert agent_file.is_file()


def test_ops_agent_has_an_output_trust_shell_integrity_section(agent_file):
    assert grep_ci(agent_file, r"^##\s.*(output[- ]trust|shell[- ]session|session[- ]integrity)")


def test_ops_agent_warns_about_echoed_input_stale_pty_buffer(agent_file):
    assert grep_ci(agent_file, r"(echo(es|ed|ing)?\s.*(input|command)|stale\s.*(buffer|prompt|pty)|desync)")


def test_ops_agent_forbids_fabricating_a_diagnosis_from_unverified_output(agent_file):
    assert grep_ci(agent_file, r"(never|do not|don.t)\s.*(fabricat|conclu|diagnos|narrat|trust)")


def test_ops_agent_prescribes_the_trivial_verifiable_probe(agent_file):
    assert "kubectl get nodes --context fleet" in agent_file.read_text(encoding="utf-8", errors="replace")


def test_ops_agent_tells_the_agent_to_report_the_broken_environment_instead(agent_file):
    assert grep_ci(agent_file, r"(report|surface|stop|abort|bail).*(broken|corrupt|unreliable|environment|session)")
