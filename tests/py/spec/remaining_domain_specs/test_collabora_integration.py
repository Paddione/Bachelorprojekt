"""Native migration of tests/spec/collabora-integration.bats."""
import yaml

def test_collabora_security_context(repo_root):
    docs = yaml.safe_load_all((repo_root / 'k3d/office-stack/collabora.yaml').read_text())
    deployment = next(doc for doc in docs if doc.get('kind') == 'Deployment')
    containers = deployment['spec']['template']['spec']['containers']
    collabora = next(container for container in containers if container.get('name') == 'collabora')
    context = collabora.get('securityContext')
    assert isinstance(context, dict)
    assert context.get('runAsNonRoot') is True
    caps = context.get('capabilities', {}).get('add') or []
    for cap in ['SYS_ADMIN', 'MKNOD', 'SETUID', 'SETGID']:
        assert cap in caps
    assert context.get('allowPrivilegeEscalation') is not False
