"""Native migration of tests/spec/divergence-guard.bats."""
import re

def test_worktree_divergence_guard(repo_root):
    text = (repo_root / 'scripts/worktree-create.sh').read_text()
    assert re.search(r'merge-base.*is-ancestor.*origin/main.*main', text)

def test_push_sync_fetch(repo_root):
    assert 'git fetch origin main' in (repo_root / 'scripts/git-safe-push.sh').read_text()

def test_push_equivalence_and_clean_guard(repo_root):
    text = (repo_root / 'scripts/git-safe-push.sh').read_text()
    for needle in ['patch-id', 'reset --hard origin/main', '--porcelain']:
        assert needle in text
