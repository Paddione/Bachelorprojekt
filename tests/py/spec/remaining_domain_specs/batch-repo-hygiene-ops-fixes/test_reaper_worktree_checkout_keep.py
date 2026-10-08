"""Native migration of tests/spec/batch-repo-hygiene-ops-fixes/reaper-worktree-checkout-keep.bats."""
import os
import shutil
import sys

def test_live_worktree_kept(repo_root, run_cmd, tmp_path):
    git = shutil.which('git')
    assert git
    stub = tmp_path/'git'
    stub.write_text('#!'+sys.executable+"\nimport os,sys\na=sys.argv[1:]\nif a[0]=='fetch': sys.exit(0)\nif a[0]=='ls-remote': print('0000000000000000000000000000000000000001\\trefs/heads/feature/wt-live-T012445');sys.exit(0)\nif a[0]=='worktree': print('worktree /tmp/some-main\\nHEAD 0000000\\nbranch refs/heads/feature/wt-live-T012445\\n');sys.exit(0)\nos.execv("+repr(git)+",["+repr(git)+"]+a)\n")
    stub.chmod(0o755)
    res=run_cmd(['bash',str(repo_root/'scripts/branch-reaper.sh'),'--sweep','--dry-run'],env={'PATH':str(tmp_path)+os.pathsep+os.environ['PATH']})
    res.check(0)
    assert 'KEEP feature/wt-live-T012445' in res.output
    assert 'in einem Worktree ausgecheckt' in res.output
