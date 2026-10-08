"""Native migration of tests/spec/workstation-cluster-iso/k3s-join-guards.bats."""
import os
import pytest

@pytest.fixture
def join(repo_root, run_cmd):
    return lambda args: run_cmd(['bash', str(repo_root / 'scripts/iso/autoinstall/k3s-join.sh'), *args])

def test_help(join):
    result = join(['--help'])
    result.check()
    for role in ['init', 'server', 'agent']:
        assert role in result.output

@pytest.mark.parametrize(('args', 'expected'), [
    (['--token', 'abc123'], 'role'),
    (['--role', 'master', '--token', 'abc123'], 'rolle'),
    (['--role', 'init'], 'token'),
    (['--role', 'server', '--token', 'abc123'], 'server'),
    (['--role', 'agent', '--token', 'abc123'], 'server'),
])
def test_invalid_args(join, args, expected):
    result = join(args)
    assert result.returncode != 0
    assert expected in result.output.lower()

def test_init_with_server(join):
    result = join(['--role', 'init', '--token', 'abc123', '--server', 'https://10.0.0.1:6443'])
    assert result.returncode != 0

def test_valid_init_passes_argument_guard(join):
    if os.geteuid() == 0:
        pytest.skip('Root would proceed into actual cluster installation; this guard requires a non-root runner')
    result = join(['--role', 'init', '--token', 'abc123'])
    assert result.returncode != 0
    assert 'root' in result.output.lower()
