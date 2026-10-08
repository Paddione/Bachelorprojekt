"""Native migration of tests/spec/harness-workflow-split/harness-enum.bats."""
import pytest

def test_dsh_validation_placeholder():
    pytest.skip('Original case accepted any validator outcome with || true')

def test_all_enum(repo_root):
    assert "'all'" in (repo_root / 'scripts/agent-guide/validate.mjs').read_text()

def test_dsh_enum(repo_root):
    assert "'dsh'" in (repo_root / 'scripts/agent-guide/validate.mjs').read_text()

def test_existing_both_entries(repo_root):
    lines = (repo_root / 'docs/agent-guide/registry/tools.yaml').read_text().splitlines()
    assert sum('harness: both' in line for line in lines) == 10
    assert not any('harness: all' in line for line in lines)

def test_validator_runs(repo_root, run_cmd):
    res = run_cmd(['node', str(repo_root / 'scripts/agent-guide/validate.mjs')])
    assert 'ok' in res.output or res.returncode == 0
