"""Native pytest migration of tests/spec/website-core/email-notifications.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_notify_unread_cronjob_ist_suspendiert_1(repo_root, run_cmd, tmp_path):
    'notify-unread CronJob ist suspendiert'
    path_cron = str(repo_root) + '/k3d/notify-unread-cronjob.yaml'
    path_am = str(repo_root) + '/k3d/monitoring/alertmanager-config.yaml'
    path_kust = str(repo_root) + '/k3d/kustomization.yaml'
    path_ncjob = str(repo_root) + '/k3d/nextcloud-notification-config-job.yaml'
    result = run_cmd(['grep', '-E', '^  suspend: true', path_cron])
    assert result.returncode == 0, result.output


def test_notify_unread_cronjob_bleibt_in_der_kustomization_registriert_2(repo_root, run_cmd, tmp_path):
    'notify-unread CronJob bleibt in der kustomization registriert'
    path_cron = str(repo_root) + '/k3d/notify-unread-cronjob.yaml'
    path_am = str(repo_root) + '/k3d/monitoring/alertmanager-config.yaml'
    path_kust = str(repo_root) + '/k3d/kustomization.yaml'
    path_ncjob = str(repo_root) + '/k3d/nextcloud-notification-config-job.yaml'
    result = run_cmd(['grep', '-F', 'notify-unread-cronjob.yaml', path_kust])
    assert result.returncode == 0, result.output


def test_alertmanager_config_deklariert_den_operator_receiver_3(repo_root, run_cmd, tmp_path):
    'alertmanager-config deklariert den Operator-Receiver'
    path_cron = str(repo_root) + '/k3d/notify-unread-cronjob.yaml'
    path_am = str(repo_root) + '/k3d/monitoring/alertmanager-config.yaml'
    path_kust = str(repo_root) + '/k3d/kustomization.yaml'
    path_ncjob = str(repo_root) + '/k3d/nextcloud-notification-config-job.yaml'
    result = run_cmd(['grep', '-E', '^    - name: operator-email', path_am])
    assert result.returncode == 0, result.output


def test_alertmanager_config_routet_auf_den_operator_receiver_4(repo_root, run_cmd, tmp_path):
    'alertmanager-config routet auf den Operator-Receiver'
    path_cron = str(repo_root) + '/k3d/notify-unread-cronjob.yaml'
    path_am = str(repo_root) + '/k3d/monitoring/alertmanager-config.yaml'
    path_kust = str(repo_root) + '/k3d/kustomization.yaml'
    path_ncjob = str(repo_root) + '/k3d/nextcloud-notification-config-job.yaml'
    result = run_cmd(['grep', '-E', '^    receiver: operator-email', path_am])
    assert result.returncode == 0, result.output


def test_alertmanager_config_deklariert_operator_email_t900001_e_mail_konfig_deaktiviert_receiver_b_5(repo_root, run_cmd, tmp_path):
    'alertmanager-config deklariert operator-email (T900001: E-Mail-Konfig deaktiviert, Receiver bleibt)'
    path_cron = str(repo_root) + '/k3d/notify-unread-cronjob.yaml'
    path_am = str(repo_root) + '/k3d/monitoring/alertmanager-config.yaml'
    path_kust = str(repo_root) + '/k3d/kustomization.yaml'
    path_ncjob = str(repo_root) + '/k3d/nextcloud-notification-config-job.yaml'
    result = run_cmd(['grep', '-E', '^    - name: operator-email', path_am])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-F', 'emailConfigs:', path_am])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-F', 'to: korczewski@mailbox.org', path_am])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-E', '^  receivers:', path_am])
    assert result.returncode == 0, result.output


def test_nextcloud_notification_config_job_existiert_und_ist_ein_batch_v1_job_7(repo_root, run_cmd, tmp_path):
    'nextcloud-notification-config-Job existiert und ist ein batch/v1 Job'
    path_cron = str(repo_root) + '/k3d/notify-unread-cronjob.yaml'
    path_am = str(repo_root) + '/k3d/monitoring/alertmanager-config.yaml'
    path_kust = str(repo_root) + '/k3d/kustomization.yaml'
    path_ncjob = str(repo_root) + '/k3d/nextcloud-notification-config-job.yaml'
    assert Path(path_ncjob).is_file()
    result = run_cmd(['grep', '-E', '^kind: Job', path_ncjob])
    assert result.returncode == 0, result.output


def test_nextcloud_notification_config_job_ist_in_der_kustomization_registriert_8(repo_root, run_cmd, tmp_path):
    'nextcloud-notification-config-Job ist in der kustomization registriert'
    path_cron = str(repo_root) + '/k3d/notify-unread-cronjob.yaml'
    path_am = str(repo_root) + '/k3d/monitoring/alertmanager-config.yaml'
    path_kust = str(repo_root) + '/k3d/kustomization.yaml'
    path_ncjob = str(repo_root) + '/k3d/nextcloud-notification-config-job.yaml'
    result = run_cmd(['grep', '-F', 'nextcloud-notification-config-job.yaml', path_kust])
    assert result.returncode == 0, result.output
