"""Native migration of tests/spec/worktree-gitdir-guard.bats."""
import pytest

@pytest.fixture
def git_fixture(tmp_path, run_cmd):
    run_cmd(['git', 'init', '-q', '-b', 'main', str(tmp_path)]).check()
    for key, value in [('user.email', 'test@example.invalid'), ('user.name', 'test')]:
        run_cmd(['git', 'config', key, value], cwd=tmp_path).check()
    (tmp_path / 'base.txt').write_text('base\n')
    run_cmd(['git', 'add', 'base.txt'], cwd=tmp_path).check()
    run_cmd(['git', 'commit', '-qm', 'base'], cwd=tmp_path).check()
    run_cmd(['git', 'worktree', 'add', '-q', str(tmp_path / 'linked'), '-b', 'fix/T900066-guard'], cwd=tmp_path).check()
    return tmp_path

def validate(repo_root, run_cmd, path):
    return run_cmd(['bash', '-c', 'source "$1"; worktree_validate_gitdir --worktree "$2" --command-name "git commit"', 'guard', str(repo_root / 'scripts/lib/worktree-gitdir-guard.sh'), str(path)])

def test_registered_worktree(repo_root, run_cmd, git_fixture):
    validate(repo_root, run_cmd, git_fixture / 'linked').check()

def test_deleted_git_file(repo_root, run_cmd, git_fixture):
    (git_fixture / 'linked/.git').unlink()
    result = validate(repo_root, run_cmd, git_fixture / 'linked')
    assert result.returncode != 0
    assert 'refusing to write' in result.output

def test_unregistered_directory(repo_root, run_cmd, git_fixture):
    path = git_fixture / 'unregistered'
    path.mkdir()
    result = validate(repo_root, run_cmd, path)
    assert result.returncode != 0
    assert ".git' is missing" in result.output
