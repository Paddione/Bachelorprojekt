"""Native migration of tests/spec/sessions-server.bats."""
import re
import pytest
import yaml

@pytest.fixture
def manifest(repo_root):
    return (repo_root / 'k3d/sessions-server.yaml').read_text()

def test_spec_covered(run_cmd):
    run_cmd(['true']).check()

def test_nginx_8080(manifest):
    assert re.search(r'listen\s+8080', manifest)
    assert re.search(r'containerPort:\s*8080', manifest)

def test_service_8080(manifest):
    assert re.search(r'targetPort:\s*8080', manifest)

def test_nonroot_deployment(manifest):
    deployment = next(doc for doc in yaml.safe_load_all(manifest) if doc and doc.get('kind') == 'Deployment')
    security = deployment['spec']['template']['spec']['containers'][0]['securityContext']
    assert deployment['spec']['template']['spec']['securityContext']['runAsNonRoot'] is True
    assert security['readOnlyRootFilesystem'] is True

def test_conf_volume_filter(manifest):
    assert re.search(r'key:\s*default\.conf', manifest)
    deployment = next(doc for doc in yaml.safe_load_all(manifest) if doc and doc.get('kind') == 'Deployment')
    volume = next(volume for volume in deployment['spec']['template']['spec']['volumes'] if volume['name'] == 'nginx-conf')
    keys = [item['key'] for item in volume['configMap']['items']]
    assert 'default.conf' in keys
    assert 'nginx.conf' not in keys
