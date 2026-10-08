"""Native migration of tests/spec/lavish.bats."""
import re
import pytest

def block(repo_root):
    text=(repo_root/'.claude/skills/lavish/SKILL.md').read_text()
    match=re.search(r'^## .*Reload Safety[^\n]*\n.*?(?=^## |\Z)',text,re.M|re.S)
    return match.group() if match else ''

def test_section_exists(repo_root):
    assert block(repo_root)

def test_no_reload_pending_poll(repo_root):
    assert re.search(r'never.*reload.*poll|poll.*outstanding|while a `?poll`? (call )?is (still )?outstanding',block(repo_root),re.I)

def test_poll_status(repo_root):
    assert re.search(r'poll (result|status)',block(repo_root),re.I)

def test_form_state_risk(repo_root):
    assert re.search(r'input.{0,20}playbook|form state|unsubmitted',block(repo_root),re.I)

def test_warn_before_reload(repo_root):
    assert re.search(r'warn the user|explicitly warn',block(repo_root),re.I)

def test_gotchas_reference(repo_root):
    path=repo_root/'.claude/skills/references/dev-flow-gotchas.md'
    if not path.is_file():
        pytest.skip('dev-flow-gotchas.md not found')
    assert re.search(r'lavish.*reload|reload.*lavish',path.read_text(),re.I)
