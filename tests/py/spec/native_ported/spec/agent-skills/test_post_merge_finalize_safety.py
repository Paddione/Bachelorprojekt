"""Real Git regression fixtures for squash evidence and destructive cleanup."""
import json
import os
import subprocess

import pytest


@pytest.fixture
def safety(tmp_path, repo_root):
    repo, wt, remote, bin_dir = (tmp_path / name for name in ('repo', 'wt', 'remote', 'bin'))

    def git(path, *args):
        return subprocess.check_output(['git', '-C', str(path), *args], text=True).strip()

    repo.mkdir()
    git(repo, 'init', '-q', '-b', 'master')
    git(repo, 'config', 'user.email', 'fixture@example.invalid')
    git(repo, 'config', 'user.name', 'Fixture')
    (repo / 'file').write_text('base\n')
    git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'base')
    subprocess.run(['git', 'init', '-q', '--bare', str(remote)], check=True)
    git(repo, 'remote', 'add', 'origin', str(remote))
    git(repo, 'push', '-q', '-u', 'origin', 'master')
    git(repo, 'remote', 'set-head', 'origin', 'master')
    git(repo, 'worktree', 'add', '-q', '-b', 'fix/example', str(wt))
    (wt / 'file').write_text('base\nfeature\n')
    git(wt, 'commit', '-qam', 'feature')
    tip = git(wt, 'rev-parse', 'HEAD')
    git(repo, 'merge', '--squash', 'fix/example'); git(repo, 'commit', '-qm', 'squash')
    merge = git(repo, 'rev-parse', 'HEAD')
    git(repo, 'push', '-q', 'origin', 'master')
    scripts = repo / 'scripts'; scripts.mkdir()
    (scripts / 'agent-lock.sh').write_text('echo free\n')
    (scripts / 'worktree-clean-check.sh').write_text('exit 0\n')
    bin_dir.mkdir()
    gh = bin_dir / 'gh'; gh.write_text('#!/bin/bash\nprintf "%s\\n" "$PR_JSON"\n'); gh.chmod(0o755)
    evidence = dict(state='MERGED', headRefName='fix/example', headRefOid=tip,
                    baseRefName='master', mergeCommit=dict(oid=merge))
    env = dict(os.environ, PATH=f'{bin_dir}:{os.environ["PATH"]}', PR_JSON=json.dumps(evidence))
    lib = repo_root / 'scripts/lib/finalize-step-guards.sh'

    def guard(function, *args):
        return subprocess.run(['bash', '-c', 'source "$1"; shift; "$@"', '_', str(lib),
                               function, str(repo), *map(str, args)], env=env, capture_output=True)

    return repo, wt, scripts, evidence, env, git, guard


@pytest.mark.parametrize('mutation', ['none', 'later', 'open', 'wrong-head', 'missing-merge', 'fetch-outage'])
def test_squash_evidence(safety, mutation):
    repo, wt, _, evidence, env, git, guard = safety
    if mutation == 'later':
        (wt / 'file').write_text('later\n'); git(wt, 'commit', '-qam', 'later')
    elif mutation == 'open':
        evidence['state'] = 'OPEN'
    elif mutation == 'wrong-head':
        evidence['headRefName'] = 'fix/foreign'
    elif mutation == 'missing-merge':
        evidence['mergeCommit']['oid'] = evidence['headRefOid']
    elif mutation == 'fetch-outage':
        git(repo, 'remote', 'set-url', 'origin', str(repo / 'missing'))
    env['PR_JSON'] = json.dumps(evidence)
    assert (guard('finalize_branch_fully_merged', 'fix/example', '123').returncode == 0) == (mutation == 'none')


@pytest.mark.parametrize('mutation', ['none', 'tracked', 'allowlist', 'foreign', 'unknown'])
def test_cleanup_retains_unproven_work(safety, mutation):
    _, wt, scripts, _, _, _, guard = safety
    if mutation == 'tracked':
        (wt / 'file').write_text('dirty\n')
    elif mutation == 'allowlist':
        path = wt / '.agents/plans/private/tasks.md'; path.parent.mkdir(parents=True); path.write_text('precious')
    elif mutation == 'foreign':
        (scripts / 'agent-lock.sh').write_text('echo held; exit 3\n')
    elif mutation == 'unknown':
        (scripts / 'agent-lock.sh').write_text('exit 2\n')
    assert (guard('finalize_cleanup_safe', 'fix/example', wt).returncode == 0) == (mutation == 'none')
    assert wt.is_dir()


def test_strict_remove_preserves_late_changes(safety):
    _, wt, _, _, _, _, guard = safety
    (wt / 'late').write_text('precious')
    assert guard('finalize_remove_clean_worktree', wt).returncode != 0
    assert (wt / 'late').read_text() == 'precious'


@pytest.mark.parametrize('foreign', [False, True])
def test_real_owned_claim_release_and_foreign_session(safety, repo_root, foreign):
    import shutil
    repo, wt, scripts, _, env, _, guard = safety
    for path in (repo_root / 'scripts').glob('agent-lock*.sh'):
        shutil.copy(path, scripts / path.name)
    shutil.copy(repo_root / 'scripts/worktree-clean-check.sh', scripts / 'worktree-clean-check.sh')
    env['AGENT_LOCK_SID'] = 'fixture-owner'
    subprocess.run(['bash', str(scripts / 'agent-lock.sh'), 'claim', 'branch', 'fix/example',
                    '--worktree', str(wt), '--branch', 'fix/example'],
                   cwd=repo, env=env, check=True, capture_output=True)
    if foreign:
        other_env = dict(env, AGENT_LOCK_SID='fixture-foreign')
        subprocess.run(['bash', str(scripts / 'agent-lock.sh'), 'claim', 'ticket', 'T-other',
                        '--worktree', str(wt), '--branch', 'fix/example'],
                       cwd=repo, env=other_env, check=True, capture_output=True)
    assert guard('finalize_cleanup_safe', 'fix/example', wt).returncode == 0
    assert guard('finalize_release_owned_claims', 'fix/example').returncode == 0
    result = subprocess.run(['bash', str(scripts / 'worktree-clean-check.sh'), str(wt)],
                            cwd=repo, env=env, capture_output=True)
    assert (result.returncode == 0) == (not foreign)
    if not foreign:
        assert guard('finalize_remove_clean_worktree', wt).returncode == 0
        assert not wt.exists()
    else:
        assert wt.exists()


def test_completed_frontmatter_is_local_archive_receipt(safety, repo_root, tmp_path):
    # Der lokale Receipt ist Frontmatter-`completed` im Plan-File (kein DB-Timeline-Event):
    # anwenden -> completed gesetzt; zweites Anwenden idempotent (rc 0, Inhalt stabil).
    plan = tmp_path / 'tasks.md'
    plan.write_text('---\ntitle: x\ndomains: [ops]\nstatus: active\n---\n\n# Plan\n')
    lib = repo_root / 'scripts/lib/finalize-frontmatter.sh'
    # Die Lib erwartet _PLAN_STATUS_ACTIVE_ALT vom Aufrufer (setzt finalize.sh) —
    # ohne sie matcht das Sed nichts (stille No-op per `|| true`).
    setup = '_PLAN_STATUS_ACTIVE_ALT="(active|plan_staged|in_progress|planning)"; source "$1"'
    first = subprocess.run(['bash', '-c', setup + '; _apply_completed_frontmatter_cli "$2"',
                            '_', str(lib), str(plan)], capture_output=True, text=True)
    assert first.returncode == 0, first.stderr
    marked = plan.read_text()
    assert 'status: completed' in marked
    second = subprocess.run(['bash', '-c', setup + '; _apply_completed_frontmatter_cli "$2"',
                             '_', str(lib), str(plan)], capture_output=True, text=True)
    assert second.returncode == 0, second.stderr
    assert plan.read_text() == marked
