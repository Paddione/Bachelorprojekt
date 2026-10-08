"""Native migration of tests/spec/sdlc/dev-admin-session-guards.bats."""
import pytest

def test_missing_database_url(repo_root, run_cmd):
    result = run_cmd(['env', '-u', 'SESSIONS_DATABASE_URL', 'node', str(repo_root / 'scripts/dev-admin-session.mjs')])
    assert result.returncode != 0
    assert 'sessions_database_url' in result.output.lower()

@pytest.mark.parametrize('host', ['db.example.com', '10.0.0.5'])
def test_remote_host_rejected(repo_root, run_cmd, host):
    result = run_cmd(['node', str(repo_root / 'scripts/dev-admin-session.mjs')], env={'SESSIONS_DATABASE_URL': f'postgres://u:p@{host}:5432/x'})
    assert result.returncode != 0
    assert host in result.output

def test_localhost_passes_host_guard(repo_root, run_cmd):
    result = run_cmd(['node', str(repo_root / 'scripts/dev-admin-session.mjs')], env={'SESSIONS_DATABASE_URL': 'postgres://u:p@127.0.0.1:59999/x'})
    assert 'verweigert' not in result.output.lower()
