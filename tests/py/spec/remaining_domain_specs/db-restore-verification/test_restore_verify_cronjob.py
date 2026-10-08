"""Native migration of tests/spec/db-restore-verification/restore-verify-cronjob.bats."""
import subprocess
import yaml

def cron(repo_root):
    return next(doc for doc in yaml.safe_load_all((repo_root/'k3d/backup-restore-verify-cronjob.yaml').read_text()) if doc.get('kind')=='CronJob')

def script(repo_root):
    result=cron(repo_root)['spec']['jobTemplate']['spec']['template']['spec']['containers'][0]['args'][0]
    assert result and result != 'null'
    return result

def test_weekly_schedule(repo_root):
    assert cron(repo_root)['spec']['schedule']=='30 3 * * 0'

def test_disposable_restore_and_evidence(repo_root):
    text=script(repo_root)
    for needle in ['restore_verify_','DROP DATABASE','restore-verification.jsonl']:
        assert needle in text

def test_embedded_bash_syntax(repo_root):
    res=subprocess.run(['bash','-n'],input=script(repo_root),capture_output=True,text=True,timeout=60)
    assert res.returncode==0,res.stderr

def test_base_wiring(repo_root):
    assert 'backup-restore-verify-cronjob.yaml' in (repo_root/'k3d/kustomization.yaml').read_text()
