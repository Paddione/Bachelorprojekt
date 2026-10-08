"""Native migration of tests/spec/monitoring-alerts.bats; manifest guards."""
import re
import pytest
import yaml

@pytest.fixture
def rules(repo_root):
    return repo_root / 'k3d/monitoring/prometheus-rules.yaml'

def test_rules_exists(rules):
    assert rules.is_file()

@pytest.mark.parametrize('alert', ['PodCrashLoopBackOff', 'HighCPUUsage', 'HighMemoryUsage', 'HighDiskUsage', 'High5xxErrorRate', 'PodRestartSpike', 'NodeHighCPUUsage', 'NodeFilesystemAlmostFull', 'BackupJobFailed', 'BackupCronJobStale', 'RestoreVerifyStale'])
def test_mandatory_alert(rules, alert):
    assert alert in rules.read_text()

def test_alertmanager_exists(repo_root):
    assert (repo_root / 'k3d/monitoring/alertmanager-config.yaml').is_file()

def test_operator_mailbox(repo_root):
    text = (repo_root / 'k3d/monitoring/alertmanager-config.yaml').read_text()
    for pattern in [r'^  receivers:', r'^    - name: operator-email', r'^    receiver: operator-email', 'emailConfigs:', 'to: korczewski@mailbox.org', 'authPassword:']:
        assert re.search(pattern, text, re.M)
    assert 'pushoverConfigs:' not in text

def test_no_orphan_resources(repo_root):
    directory = repo_root / 'k3d/monitoring'
    config = yaml.safe_load((directory / 'kustomization.yaml').read_text())
    registered = set(config.get('resources', [])) | {p['path'] for p in config.get('patches', []) if 'path' in p}
    offenders = []
    for path in directory.glob('*.yaml'):
        text = path.read_text()
        if path.name != 'kustomization.yaml' and '${' not in text and re.search(r'^kind:', text, re.M) and path.name not in registered:
            offenders.append(path.name)
    assert not offenders

def test_health_goals_cronjob_absent(repo_root):
    assert not (repo_root / 'k3d/monitoring/health-goals-cronjob.yaml').is_file()

def test_resource_limits_cover_containers(repo_root):
    text = (repo_root / 'prod/monitoring/resource-limits-patch.yaml').read_text()
    assert re.search(r'^kind: DaemonSet', text, re.M)
    assert 'name: monitoring-prometheus-node-exporter' in text
    lines = text.splitlines()
    for container in ['node-exporter', 'grafana-sc-dashboard', 'grafana-sc-datasources', 'kube-state-metrics', 'kube-prometheus-stack']:
        assert any('resources:' in '\n'.join(lines[i:i+4]) for i, line in enumerate(lines) if f'- name: {container}' in line)
