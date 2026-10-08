"""Native migration of tests/spec/lockfile-drift.bats."""
def test_website_lock_not_tracked(repo_root, run_cmd):
    res = run_cmd(['git', 'ls-files', '--error-unmatch', 'components/website/package-lock.json'])
    assert res.returncode != 0

def test_website_ignore_lock(repo_root):
    assert 'package-lock.json' in (repo_root / 'components/website/.gitignore').read_text()
