"""Native migration of tests/spec/website-core/email-notifications.bats."""
# T016592 turns off all outgoing notification mails. Cross-cutting source verification

# (documented exception T002448-M4): the behaviour lives only in the manifests.

import re

import pytest


@pytest.fixture
def files(repo_root):
    k3d = repo_root / "k3d"
    return {
        "cron": k3d / "notify-unread-cronjob.yaml",
        "am": k3d / "monitoring" / "alertmanager-config.yaml",
        "kust": k3d / "kustomization.yaml",
        "ncjob": k3d / "nextcloud-notification-config-job.yaml",
    }


def _text(path):
    return path.read_text(encoding="utf-8") if path.is_file() else ""


def _has(path, pattern, regex=True):
    text = _text(path)
    return re.search(pattern, text, re.MULTILINE) is not None if regex else pattern in text


def test_notify_unread_cronjob_ist_suspendiert(files):
    assert _has(files["cron"], r"^  suspend: true")


def test_notify_unread_cronjob_bleibt_in_der_kustomization_registriert(files):
    # Positive anchor: switching off only adds a field; the manifest stays registered.
    assert _has(files["kust"], "notify-unread-cronjob.yaml", regex=False)


def test_alertmanager_config_deklariert_den_operator_receiver(files):
    assert _has(files["am"], r"^    - name: operator-email")


def test_alertmanager_config_routet_auf_den_operator_receiver(files):
    assert _has(files["am"], r"^    receiver: operator-email")


def test_alertmanager_config_deklariert_operator_email_t900001_e_mail_konfig_deaktiviert_receiver_bleibt(files):
    assert _has(files["am"], r"^    - name: operator-email")
    # emailConfigs block exists as a commented declaration.
    assert _has(files["am"], "emailConfigs:", regex=False)
    assert _has(files["am"], "to: korczewski@mailbox.org", regex=False)
    assert _has(files["am"], r"^  receivers:")


def test_alertmanager_config_traegt_keine_backup_email_kindroute_mehr(files):
    # Only uncommented lines: the explanatory block in the manifest names the removed receiver on purpose.
    live = [l for l in _text(files["am"]).splitlines() if not re.match(r"^\s*#", l)]
    assert live, "grep -vE '^\\s*#' lieferte keine Zeilen"
    assert "backup-email" not in "\n".join(live)


def test_nextcloud_notification_config_job_existiert_und_ist_ein_batch_v1_job(files):
    assert files["ncjob"].is_file()
    assert _has(files["ncjob"], r"^kind: Job")


def test_nextcloud_notification_config_job_ist_in_der_kustomization_registriert(files):
    assert _has(files["kust"], "nextcloud-notification-config-job.yaml", regex=False)
