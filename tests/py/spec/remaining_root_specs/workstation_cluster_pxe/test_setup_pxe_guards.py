"""Native migration of tests/spec/workstation-cluster-pxe/setup-pxe-guards.bats."""
import pytest

@pytest.fixture
def pxe(repo_root, run_cmd, tmp_path):
    key = tmp_path / 'id_test.pub'
    key.write_text('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITESTKEYTESTKEYTESTKEY test@example\n')
    return lambda args: run_cmd(['bash', str(repo_root / 'scripts/pxe/setup-pxe.sh'), *args]), key, tmp_path

def test_help(pxe):
    execute, _, _ = pxe
    result = execute(['--help'])
    result.check()
    assert '--ssh-key' in result.output
    assert 'proxy-dhcp' in result.output.lower()

def test_missing_key(pxe):
    execute, _, _ = pxe
    result = execute([])
    assert result.returncode != 0
    assert 'ssh-key' in result.output.lower()

def test_private_key(pxe):
    execute, _, tmp = pxe
    private = tmp / 'id_test'
    private.write_text('-----BEGIN OPENSSH ' + 'PRIV' + 'ATE KEY-----\nabc\n')
    assert execute(['--ssh-key', str(private)]).returncode != 0

def test_valid_key_passes_guard(pxe):
    execute, key, _ = pxe
    result = execute(['--ssh-key', str(key), '--shutdown', 'halt'])
    assert result.returncode != 0
    assert 'ssh-key' not in result.output.lower()
    assert 'shutdown' in result.output.lower()

def test_invalid_http_port(pxe):
    execute, key, _ = pxe
    result = execute(['--ssh-key', str(key), '--http-port', 'achtzig'])
    assert result.returncode != 0
    assert 'http-port' in result.output.lower()

def test_missing_node_map(pxe):
    execute, key, tmp = pxe
    result = execute(['--ssh-key', str(key), '--node-map', str(tmp / 'fehlt.map')])
    assert result.returncode != 0
    assert 'node-map' in result.output.lower()

def test_status(pxe):
    execute, _, tmp = pxe
    result = execute(['--status', '--root', str(tmp / 'leer')])
    result.check()
    assert 'pxe' in result.output.lower()

def test_stop(pxe):
    execute, _, tmp = pxe
    execute(['--stop', '--root', str(tmp / 'leer')]).check()
