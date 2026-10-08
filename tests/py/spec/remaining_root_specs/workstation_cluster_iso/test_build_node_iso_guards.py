"""Native migration of tests/spec/workstation-cluster-iso/build-node-iso-guards.bats."""
import pytest

@pytest.fixture
def build(repo_root, run_cmd, tmp_path):
    key = tmp_path / 'id_test.pub'
    key.write_text('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITESTKEYTESTKEYTESTKEYTESTKEY test@example\n')
    def execute(args):
        return run_cmd(['bash', str(repo_root / 'scripts/iso/build-node-iso.sh'), *args, '--out', str(tmp_path / 'out.iso')])
    return execute, key, tmp_path

def test_help(build):
    execute, _, _ = build
    result = execute(['--help'])
    result.check()
    assert '--ssh-key' in result.output
    assert '--node-map' in result.output

def test_missing_key(build):
    execute, _, tmp = build
    result = execute([])
    assert result.returncode != 0
    assert 'ssh-key' in result.output.lower()
    assert not (tmp / 'out.iso').is_file()

def test_private_key(build):
    execute, _, tmp = build
    private = tmp / 'id_test'
    private.write_text('-----BEGIN OPENSSH ' + 'PRIV' + 'ATE KEY-----\nabc\n')
    result = execute(['--ssh-key', str(private)])
    assert result.returncode != 0
    assert not (tmp / 'out.iso').is_file()

def test_valid_key_passes_guard(build):
    execute, key, _ = build
    result = execute(['--ssh-key', str(key), '--shutdown', 'halt'])
    assert result.returncode != 0
    assert 'ssh-key' not in result.output.lower()
    assert 'shutdown' in result.output.lower()

def test_invalid_shutdown(build):
    execute, key, _ = build
    result = execute(['--ssh-key', str(key), '--shutdown', 'halt'])
    assert result.returncode != 0
    assert 'shutdown' in result.output.lower()

def test_missing_node_map(build):
    execute, key, tmp = build
    result = execute(['--ssh-key', str(key), '--node-map', str(tmp / 'fehlt.map')])
    assert result.returncode != 0
    assert 'node-map' in result.output.lower()
