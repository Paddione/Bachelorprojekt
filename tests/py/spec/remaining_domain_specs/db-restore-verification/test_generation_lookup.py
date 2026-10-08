"""Native migration of tests/spec/db-restore-verification/generation-lookup.bats."""
import re
import subprocess
import yaml

def latest(repo_root, tmp_path):
    docs = yaml.safe_load_all((repo_root / 'k3d/backup-restore-verify-cronjob.yaml').read_text())
    doc = next(d for d in docs if d.get('kind') == 'CronJob')
    script = doc['spec']['jobTemplate']['spec']['template']['spec']['containers'][0]['args'][0]
    match = re.search(r'LATEST=\$\(find .*?\)\s*$', script, re.M | re.S)
    assert match, 'LATEST=$(find ...) missing from manifest'
    expression = match.group().replace('$$', '$').replace('/backups', str(tmp_path))
    res = subprocess.run(['bash', '-c', expression + '\nprintf "%s" "${LATEST:-}"'], capture_output=True, text=True, timeout=60)
    assert res.returncode == 0, res.stderr
    return res.stdout.rsplit('/', 1)[-1]

def test_newest_generation(repo_root, tmp_path):
    for name in ['20261006-000059', '20261007-202706', 'pvc-20261007-010007']:
        (tmp_path / name).mkdir()
    assert latest(repo_root, tmp_path) == '20261007-202706'

def test_ignore_pvc_and_foreign(repo_root, tmp_path):
    for name in ['20261006-000059', 'pvc-20991231-235959', 'lost+found']:
        (tmp_path / name).mkdir()
    assert latest(repo_root, tmp_path) == '20261006-000059'
