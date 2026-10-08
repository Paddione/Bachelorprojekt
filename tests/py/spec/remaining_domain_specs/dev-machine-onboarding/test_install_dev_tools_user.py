"""Native migration of tests/spec/dev-machine-onboarding/install-dev-tools-user.bats."""
import os
import pwd
import subprocess

def resolved(repo_root, **changes):
    env = os.environ.copy()
    for key in ['DEV_USER', 'DEV_USERS', 'SUDO_USER']:
        env.pop(key, None)
    env.update(changes)
    return subprocess.run(['bash', str(repo_root / 'scripts/install-dev-tools.sh'), '--print-dev-user'], cwd=repo_root, env=env, capture_output=True, text=True, timeout=60)

def test_sudo_caller(repo_root):
    res = resolved(repo_root, SUDO_USER='alice')
    assert res.returncode == 0
    assert res.stdout.strip() == 'alice'

def test_effective_user(repo_root):
    res = resolved(repo_root)
    assert res.returncode == 0
    assert res.stdout.strip() == pwd.getpwuid(os.geteuid()).pw_name

def test_explicit_user(repo_root):
    res = resolved(repo_root, SUDO_USER='alice', DEV_USER='gekko')
    assert res.returncode == 0
    assert res.stdout.strip() == 'gekko'

def test_multiuser_rejected(repo_root):
    anchor = resolved(repo_root, SUDO_USER='alice')
    assert anchor.returncode == 0
    assert anchor.stdout.strip() == 'alice'
    assert resolved(repo_root, DEV_USERS='patrick gekko').returncode == 2
