"""Native migration of tests/spec/branch-reaper-netzausfall.bats."""
import os
import shutil
import sys

def sweep(repo_root, run_cmd, tmp_path, fail):
    git=shutil.which('git')
    assert git
    stub=tmp_path/'git'
    stub.write_text('#!'+sys.executable+"\nimport os,sys\na=sys.argv[1:]\nif a[0] in ['fetch','ls-remote']:\n    print('fatal: unable to access' if "+repr(fail)+" else '', file=sys.stderr if "+repr(fail)+" else sys.stdout)\n    sys.exit("+('1' if fail else '0')+")\nos.execv("+repr(git)+",["+repr(git)+"]+a)\n")
    stub.chmod(0o755)
    return run_cmd(['bash',str(repo_root/'scripts/branch-reaper.sh'),'--sweep','--dry-run'],env={'PATH':str(tmp_path)+os.pathsep+os.environ['PATH'],'REPO':str(repo_root)})

def test_network_error(repo_root,run_cmd,tmp_path):
    res=sweep(repo_root,run_cmd,tmp_path,True)
    assert res.returncode != 0
    assert 'Keine Remote-Branches gefunden' not in res.output

def test_empty_remote(repo_root,run_cmd,tmp_path):
    res=sweep(repo_root,run_cmd,tmp_path,False)
    res.check(0)
    assert 'Keine Remote-Branches gefunden' in res.output
