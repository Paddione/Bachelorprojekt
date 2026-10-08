"""Native migration of tests/spec/monitoring-alerts/backup-recipient-daily-repeat.bats."""
import re

def test_backup_email_declared_and_set(repo_root):
    lines = (repo_root / 'environments/schema.yaml').read_text().splitlines()
    index = next(i for i, line in enumerate(lines) if 'name: BACKUP_ALERT_EMAIL' in line)
    assert 'required: true' in '\n'.join(lines[index:index+4])
    for env in ['mentolder', 'korczewski', 'fleet-mentolder', 'fleet-korczewski', 'staging']:
        assert 'BACKUP_ALERT_EMAIL: patrick@korczewski.de' in (repo_root / f'environments/{env}.yaml').read_text()

def test_alertmanager_no_backup_mailbox(repo_root):
    text = (repo_root / 'k3d/monitoring/alertmanager-config.yaml').read_text()
    assert re.search(r'^  route:', text, re.M)
    active = '\n'.join(line for line in text.splitlines() if not re.match(r'^\s*#', line))
    assert active
    assert 'BACKUP_ALERT_EMAIL' not in active
