"""Native migration of tests/spec/batch-worktree-guard-tooling-fixes/write-guard-suffix-normalization.bats."""
import json
import os
import subprocess
import pytest

@pytest.fixture
def sandbox(run_cmd,tmp_path):
    repo=tmp_path/'repo'
    repo.mkdir()
    for name in ['wt-real','wt-other']:
        (repo/name).mkdir()
        (repo/name/'README.md').touch()
    for command in [['git','init','-b','main'],['git','config','user.email','test@example.com'],['git','config','user.name','Test User']]:
        run_cmd(command,cwd=repo).check(0)
    (repo/'README.md').touch()
    run_cmd(['git','add','README.md'],cwd=repo).check(0)
    run_cmd(['git','-c','commit.gpgsign=false','commit','-m','chore: init'],cwd=repo).check(0)
    locks=tmp_path/'locks'
    locks.mkdir()
    for file,worktree,branch,pid,label in [('batch__dead.json','wt-real-T004295','feat/batch-demo-T004295','1234','dead'),('other__live.json','wt-other','feature/other-T009999','5678','live')]:
        (locks/file).write_text(json.dumps({'owner_sid':'sid-p6-test','owner_pid':pid,'worktree':str(repo/worktree),'branch':branch,'label':label}))
    return repo,locks

def invoke(repo_root,sandbox,target,sid):
    repo,locks=sandbox
    env=os.environ.copy()
    env.update({'AGENT_LOCK_DIR':str(locks),'SID':'sid-p6-test','AGENT_LOCK_SID':sid})
    return subprocess.run(['bash',str(repo_root/'scripts/hooks/worktree-write-guard.sh')],input=json.dumps({'tool_input':{'file_path':str(repo/target/'README.md')}})+'\n',cwd=repo,env=env,capture_output=True,text=True,timeout=60)

def test_foreign_claim_denied(repo_root,sandbox):
    assert invoke(repo_root,sandbox,'wt-other','fremde-sid').returncode==2

def test_own_suffix_normalized(repo_root,sandbox):
    assert invoke(repo_root,sandbox,'wt-real','sid-p6-test').returncode==0
