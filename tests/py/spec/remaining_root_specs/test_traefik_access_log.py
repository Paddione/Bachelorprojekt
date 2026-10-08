"""Native migration of tests/spec/traefik-access-log.bats."""
import pytest

@pytest.fixture
def traefik(repo_root):
    return (repo_root / 'k3d/monitoring/traefik-metrics.yaml').read_text()

def test_namespace(traefik):
    assert '  namespace: kube-system' in traefik.splitlines()

def test_failed_json_requests(traefik):
    for flag in ['--accesslog=true', '--accesslog.format=json', '--accesslog.filters.statuscodes=400-599']:
        assert f'"{flag}"' in traefik

def test_headers_dropped(traefik):
    assert '"--accesslog.fields.headers.defaultmode=drop"' in traefik

def test_no_inert_config(repo_root):
    assert 'traefik-config.yaml' not in (repo_root / 'k3d/kustomization.yaml').read_text()
    assert not (repo_root / 'k3d/traefik-config.yaml').exists()
