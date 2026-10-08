"""Native migration of tests/spec/mishap-t002424.bats."""
import re
import pytest

@pytest.fixture
def core(repo_root):
    return (repo_root / 'scripts/vda/ticket/_ticket-core.sh').read_text()

def test_owner_sid_in_guard(core):
    assert 'owner_sid' in core
    block = re.search(r'_ticket_lock_guard.*?^}', core, re.M | re.S)
    assert block
    assert 'owner_sid' in block.group()

def test_session_id(core):
    assert 'CLAUDE_CODE_SESSION_ID' in core

def test_tool_detection(core):
    assert re.search(r'tool|claude|gemini|opencode', core, re.I)

def test_precheck_order(repo_root):
    lines = (repo_root / '.agents/skills/references/ticket-ops-procedures.md').read_text().splitlines()
    step = next(i for i, line in enumerate(lines) if '### Step 3.4' in line)
    invariant = next(i for i, line in enumerate(lines) if 'Pre-Check-Invariante [T002422]' in line)
    assert invariant < step

def test_lock_conflict(repo_root):
    assert 'LOCK-KONFLIKT' in (repo_root / '.agents/skills/references/ticket-ops-procedures.md').read_text()

@pytest.mark.parametrize('expected', [('--ticket',), ('UNSCOPED', '--allow-drift')])
def test_scope_help(repo_root, run_cmd, expected):
    script = repo_root / 'scripts/pr-scope-check.sh'
    assert script.is_file()
    result = run_cmd(['bash', str(script), '--help'])
    result.check()
    for value in expected:
        assert value in result.output

def test_scope_missing_ticket(repo_root, run_cmd):
    result = run_cmd(['bash', str(repo_root / 'scripts/pr-scope-check.sh')])
    result.check(1)
    assert 'Usage' in result.output
