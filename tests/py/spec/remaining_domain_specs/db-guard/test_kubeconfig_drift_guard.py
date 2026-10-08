"""Native migration of tests/spec/db-guard/kubeconfig-drift-guard.bats."""
import yaml

def invoke(repo_root, run_cmd, tmp_path, server, escape=False):
    config={'apiVersion':'v1','kind':'Config','contexts':[{'name':'lab-cluster','context':{'cluster':'lab-cluster','user':'lab-cluster'}}],'clusters':[{'name':'lab-cluster','cluster':{'server':server}}],'users':[{'name':'lab-cluster','user':{}}]}
    path=tmp_path/'config.yaml'
    path.write_text(yaml.safe_dump(config))
    return run_cmd(['bash', str(repo_root/'scripts/vda/ticket/_ctx-guard.sh'), 'lab-cluster'], env={'KUBECONFIG':str(path), 'TICKET_ALLOW_LOCAL_CTX':'1' if escape else ''})

def test_loopback_rejected(repo_root, run_cmd, tmp_path):
    res=invoke(repo_root,run_cmd,tmp_path,'https://127.0.0.1:6446')
    assert res.returncode != 0
    assert 'loopback' in res.output

def test_lan_accepted(repo_root,run_cmd,tmp_path):
    invoke(repo_root,run_cmd,tmp_path,'https://10.0.33.1:6446').check(0)

def test_escape_warns(repo_root,run_cmd,tmp_path):
    res=invoke(repo_root,run_cmd,tmp_path,'https://127.0.0.1:6446',True)
    res.check(0)
    assert 'WARN' in res.output

def test_ticket_write_wiring(repo_root):
    assert '_ctx-guard' in (repo_root/'scripts/ticket.sh').read_text()

def test_guard_syntax(repo_root,run_cmd):
    run_cmd(['bash','-n',str(repo_root/'scripts/vda/ticket/_ctx-guard.sh')]).check(0)
