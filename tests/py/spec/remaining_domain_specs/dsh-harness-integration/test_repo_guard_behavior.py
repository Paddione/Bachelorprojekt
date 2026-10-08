"""Native migration of tests/spec/dsh-harness-integration/repo-guard-behavior.bats."""
import json
import shutil
import pytest

@pytest.fixture
def cases(repo_root, run_cmd):
    if not shutil.which('node'):
        pytest.skip('node not installed')
    res = run_cmd(['node', str(repo_root / 'tests/spec/dsh-harness-integration/repo-guard-drive.mjs'), str(repo_root / 'tools/dsh/plugins/repo-guard.mjs')])
    return {item['case']: item for line in res.stdout.splitlines() if line.startswith('{') for item in [json.loads(line)]}

def test_registration(cases):
    assert cases['registration']['ok'] is True

def test_write_inside(cases):
    assert cases['write-inside']['delegated'] is True

def test_write_outside(cases):
    case = cases['write-outside']
    assert '"kind": "deny"' in json.dumps(case)
    assert '/etc/passwd' in json.dumps(case)

def test_dotdot_escape(cases):
    assert '"kind": "deny"' in json.dumps(cases['write-escape-dotdot'])

def test_prefix_trap(cases):
    assert '"kind": "deny"' in json.dumps(cases['prefix-trap'])

def test_reads_delegate(cases):
    assert cases['read-tool-outside']['delegated'] is True

def test_no_agent_delegate(cases):
    assert cases['no-agent']['delegated'] is True
