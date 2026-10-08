"""Native migration of tests/spec/centralized-logging.bats."""
import re
import pytest
import yaml

def text(repo_root):
    return (repo_root/'k3d/error-log-retention-cronjob.yaml').read_text()

def test_legacy_runner_requirement():
    pytest.skip('Original case checked BATS availability, retired by native pytest migration')

def test_manifest_yaml(repo_root):
    yaml.safe_load(text(repo_root))

def test_kind_namespace(repo_root):
    value=text(repo_root)
    assert re.search(r'^kind: CronJob$',value,re.M)
    assert re.search(r'^\s*namespace: workspace$',value,re.M)

def test_daily_schedule(repo_root):
    assert re.search(r'^\s*schedule: "[0-9]+ [0-9]+ \* \* \*"$',text(repo_root),re.M)

def test_dns_namespace(repo_root):
    value=text(repo_root)
    assert 'website.${WEBSITE_NAMESPACE}.svc.cluster.local' in value
    assert 'website.workspace.' not in value

def test_secret_reference(repo_root):
    value=text(repo_root)
    assert 'CRON_SECRET' in value
    assert 'secretKeyRef:' in value

def test_hardening(repo_root):
    value=text(repo_root)
    assert 'runAsNonRoot: true' in value
    assert 'seccompProfile:' in value
    lines=value.splitlines()
    blocks=['\n'.join(lines[i:i+51]) for i,line in enumerate(lines) if 'containers:' in line]
    assert 'allowPrivilegeEscalation: false' in '\n'.join(blocks)

def test_digest_image(repo_root):
    value=text(repo_root)
    assert re.search(r'^\s*image:',value,re.M)
    assert any('curlimages/curl' in line and '@' in line for line in value.splitlines())
