"""Native migration of tests/spec/wsl-exit-docs.bats."""
import re
import pytest

def test_adr_supersession(repo_root):
    adr7 = (repo_root / 'docs/adr/ADR-007-wsl-exit-fleet-native.md').read_text()
    adr6 = (repo_root / 'docs/adr/ADR-006-sdlc-isolation-dev-host.md').read_text()
    assert 'supersedes' in adr7.lower()
    assert 'ADR-006' in adr7
    assert re.search(r'Superseded by.*ADR-007', adr6, re.I)

def test_linux_line_endings(repo_root):
    text = (repo_root / '.gitattributes').read_text()
    for suffix in ['sh', 'yaml', 'yml', 'bats', 'mjs']:
        assert re.search(r'\*\.' + suffix + r' +text eol=lf', text)

def test_windows_spike_checklists(repo_root):
    text = (repo_root / 'docs/windows-dev-setup.md').read_text()
    assert 'opencode-windows-viability' in text.lower()
    assert 'ntfs-clone' in text.lower()
    assert re.search(r'Fleet.*Windows:1919|Windows:1919.*wg/NAT', text, re.I)
    assert sum('- [ ]' in line for line in text.splitlines()) >= 12

def test_shutdown_checklist(repo_root):
    path = repo_root / 'docs/WSL-BOOTSTRAP.md'
    if not path.is_file():
        pytest.skip('WSL-BOOTSTRAP.md exists not in this environment (e.g. CI runner)')
    text = path.read_text()
    for value in ['Shutdown-Checkliste', 'gitlab-registry-cache', 'wsl --shutdown']:
        assert value in text
