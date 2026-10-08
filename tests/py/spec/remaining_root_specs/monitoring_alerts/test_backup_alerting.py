"""Native migration of tests/spec/monitoring-alerts/backup-alerting.bats."""
import re
import pytest

@pytest.fixture
def rules(repo_root):
    return (repo_root / 'k3d/monitoring/prometheus-rules.yaml').read_text()

@pytest.fixture
def patch(repo_root):
    return (repo_root / 'k3d/monitoring/alertmanager-matcher-strategy-patch.yaml').read_text()

def block(text, anchor, following):
    lines = text.splitlines()
    matches = [i for i, line in enumerate(lines) if anchor in line]
    assert matches, anchor
    return '\n'.join('\n'.join(lines[i:i+following+1]) for i in matches)

def test_backup_group(rules):
    assert 'name: backup.rules' in rules

def test_failed_critical(rules):
    text = block(rules, 'alert: BackupJobFailed', 14)
    assert 'kube_job_status_failed' in text
    assert 'severity: critical' in text

def test_brand_namespaces(rules):
    assert 'namespace=~"workspace|workspace-korczewski"' in block(rules, 'alert: BackupJobFailed', 10)

def test_success_metric(rules):
    text = block(rules, 'alert: BackupCronJobStale', 14)
    assert 'kube_cronjob_status_last_successful_time' in text
    assert 'kube_cronjob_status_last_schedule_time' not in text

def test_suspend_filter(rules):
    assert 'kube_cronjob_spec_suspend' in block(rules, 'alert: BackupCronJobStale', 14)

def test_never_succeeded(rules):
    assert 'unless' in block(rules, 'alert: BackupCronJobStale', 14)

def test_matcher_freed(patch):
    text = block(patch, 'alertmanagerConfigMatcherStrategy', 2)
    assert 'type: ' in text
    assert not re.search(r'type: OnNamespace\s*$', text, re.M)

def test_alertmanager_target(patch):
    assert 'kind: Alertmanager' in patch
    assert 'name: monitoring-alertmanager' in patch

def test_patch_registered(repo_root):
    text = (repo_root / 'k3d/monitoring/kustomization.yaml').read_text()
    patches = block(text, 'patches:', 4)
    assert 'alertmanager-matcher-strategy-patch.yaml' in patches
    assert 'loki-sc-rules-resources-patch.yaml' in patches

def test_real_cronjob_name(rules):
    assert 'db-restore-verify' in rules
    assert 'backup-restore-verify' not in rules

def test_weekly_threshold(rules):
    assert '694800' in block(rules, 'alert: RestoreVerifyStale', 12)
    assert '93600' in block(rules, 'alert: BackupCronJobStale', 12)

def test_creation_age(rules):
    for alert in ['BackupCronJobStale', 'RestoreVerifyStale']:
        assert 'kube_cronjob_created' in block(rules, f'alert: {alert}', 16)

def test_fast_failed_and_old_jobs(rules):
    text = block(rules, 'alert: BackupJobFailed', 14)
    assert 'max_over_time' in text
    assert 'increase(' not in text
    assert 'kube_job_created' in text

def test_matcher_scoped(patch):
    assert 'OnNamespaceExceptForAlertmanagerNamespace' in block(patch, 'alertmanagerConfigMatcherStrategy', 2)
