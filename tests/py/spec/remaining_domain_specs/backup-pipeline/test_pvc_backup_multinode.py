"""Native migration of tests/spec/backup-pipeline/pvc-backup-multinode.bats."""
import re

def test_writer_no_data_mounts(repo_root):
    text = (repo_root / 'k3d/pvc-backup-cronjob.yaml').read_text()
    assert not re.search(r'name: (nextcloud-data|vaultwarden-data)$', text, re.M)

def test_reader_streams(repo_root):
    text = (repo_root / 'k3d/pvc-backup-cronjob.yaml').read_text()
    for token in ['role: reader', 'stream_volume nextcloud-data nextcloud-data-pvc', 'stream_volume vaultwarden-data "$VW_CLAIM"', 'exec -i "$WPOD" -c backup']:
        assert token in text, token

def test_orchestrator_exec_permission(repo_root):
    assert 'pods/exec' in (repo_root / 'k3d/pvc-backup-rbac.yaml').read_text()
