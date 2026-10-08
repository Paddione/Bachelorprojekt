"""Native migration of tests/spec/network-address-plan/networks-registry.bats."""
import pytest

@pytest.fixture
def check(repo_root, run_cmd):
    def execute(fixture=None):
        args = ['node', str(repo_root / 'scripts/networks-check.mjs')]
        if fixture:
            args += ['--registry', str(repo_root / 'tests/spec/network-address-plan/fixtures' / fixture)]
        return run_cmd(args)
    return execute

@pytest.mark.parametrize(('fixture', 'positive', 'expected'), [
    ('undeclared-overlap.yaml', 'valid.yaml', ['alpha', 'beta']),
    ('prefix-span-overlap.yaml', 'valid.yaml', ['home-lan', 'pod-cidr']),
    ('spurious-overlap.yaml', 'declared-overlap.yaml', ['alpha']),
    ('unknown-overlap-id.yaml', 'valid.yaml', ['gibt-es-nicht']),
    ('unnormalised-cidr.yaml', 'valid.yaml', ['10.42.5.7/24']),
    ('duplicate-id.yaml', 'valid.yaml', ['alpha']),
])
def test_invalid_registry(check, fixture, positive, expected):
    check(positive).check()
    result = check(fixture)
    assert result.returncode != 0
    for value in expected:
        assert value in result.output

def test_declared_overlap(check):
    check('declared-overlap.yaml').check()

def test_real_registry(repo_root, check):
    assert (repo_root / 'docs/agent-guide/registry/networks.yaml').is_file()
    check().check()

def test_collected_ranges(repo_root):
    text = (repo_root / 'docs/agent-guide/registry/networks.yaml').read_text()
    for cidr in ['10.0.0.0/8', '10.13.14.0/24', '10.20.0.0/24', '10.42.0.0/16', '10.43.0.0/16', '100.64.0.0/10', '172.17.0.0/16', '172.23.0.0/16', '192.168.100.0/24']:
        assert cidr in text

def test_retired_mesh(repo_root):
    text = (repo_root / 'docs/agent-guide/registry/networks.yaml').read_text()
    assert '10.13.14.0/24' in text
    assert 'retired' in text

def test_generated_map(repo_root):
    assert '10.20.0.0/24' in (repo_root / 'docs/agent-guide/maps/networks-map.md').read_text()
