"""Native migration of tests/spec/dev-stack-tmp-mounts.bats."""
import yaml

def test_nonroot_writable_tmp(repo_root):
    problems=[]
    for path in sorted((repo_root / 'k3d/dev-stack').glob('*.yaml')):
        for doc in yaml.safe_load_all(path.read_text()):
            if not isinstance(doc, dict) or doc.get('kind') != 'Deployment':
                continue
            pod = (doc.get('spec') or {}).get('template', {}).get('spec', {})
            volumes = {volume.get('name'): volume for volume in pod.get('volumes') or []}
            for container in pod.get('containers') or []:
                uid = (container.get('securityContext') or {}).get('runAsUser')
                if uid in (None, 0) or container.get('name') == 'oauth2-proxy':
                    continue
                mounted = any(mount.get('mountPath', '').rstrip('/') == '/tmp' and volumes.get(mount.get('name'), {}).get('emptyDir') is not None for mount in container.get('volumeMounts') or [])
                if not mounted:
                    problems.append((str(path), container.get('name'), uid))
    assert not problems, problems
