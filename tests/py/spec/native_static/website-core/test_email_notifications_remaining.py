"""Remaining native case from tests/spec/website-core/email-notifications.bats."""


def test_alertmanager_has_no_backup_email_child_route(repo_root):
    lines = (repo_root / "k3d/monitoring/alertmanager-config.yaml").read_text().splitlines()
    active = "\n".join(line for line in lines if not line.lstrip().startswith("#"))
    assert active
    assert "backup-email" not in active
