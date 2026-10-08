"""Native migration of tests/spec/systemd-units/unit-install-copy-guard.bats."""
import re

def test_no_symlink_install(repo_root, run_cmd):
    result = run_cmd(['git', 'ls-files', 'scripts/**/*.service', 'scripts/**/*.timer'])
    result.check()
    paths = result.stdout.splitlines()
    assert paths
    assert not [path for path in paths if re.search(r'ln -sfn?\s.*systemd/user', (repo_root / path).read_text())]

def test_glimmer_copy_install(repo_root):
    assert re.search(r'cp .*\.service ~/.config/systemd/user/', (repo_root / 'scripts/llm/glimmer.service').read_text())
