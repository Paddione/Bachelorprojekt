"""Native migration of tests/spec/mishap-bundle-2026-06-30.bats."""
import re

def test_stale_detection(repo_root):
    assert 'git-crypt-guard.sh' in (repo_root / 'scripts/worktree-create.sh').read_text()

def test_key_recopied(repo_root):
    lines = (repo_root / 'scripts/worktree-create.sh').read_text().splitlines()
    assert sum(bool(re.search(r'cp.*git-crypt/keys/default', line)) for line in lines) >= 2

def test_created_pr_url_verified(repo_root):
    text = (repo_root / '.claude/skills/dev-flow-execute/SKILL.md').read_text()
    assert 'gh pr create' in text
    assert "PR_URL=$(gh pr view --json url -q '.url')" in text

# test_status_consistency retiriert 2026-10-14: die Status/Done_at-Invariante
# lebte in scripts/ticket-status-validate.sh (mit dem Ticket-System entfernt).
