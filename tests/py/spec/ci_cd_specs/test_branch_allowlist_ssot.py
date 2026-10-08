"""Native assertions from tests/spec/ci-cd/branch-allowlist-ssot.bats."""

import shlex
import shutil

import pytest


@pytest.fixture
def sandbox(repo_root, run_cmd, tmp_path):
    home = tmp_path / "home"
    home.mkdir()
    global_config = home / ".gitconfig"
    global_config.touch()
    environment = {"HOME": str(home), "GIT_CONFIG_GLOBAL": str(global_config), "FRESHNESS_HOOK_DISABLED": "1"}
    directory = tmp_path / "sandbox"
    (directory / ".githooks").mkdir(parents=True)
    (directory / "scripts/lib").mkdir(parents=True)
    run_cmd(["git", "init", "-q", "-b", "main", str(directory)], env=environment).check()
    shutil.copy(repo_root / ".githooks/pre-commit", directory / ".githooks/pre-commit")
    if (repo_root / ".gitleaks.toml").is_file():
        shutil.copy(repo_root / ".gitleaks.toml", directory / ".gitleaks.toml")
    library = repo_root / "scripts/lib/branch-allowlist.sh"
    if library.is_file():
        shutil.copy(library, directory / "scripts/lib/branch-allowlist.sh")
    for script in ["agent-lock.sh", "agent-collision.sh", "git-crypt-guard.sh", "plan-half-archive-check.sh", "plan-main-staging-guard.sh"]:
        file = directory / "scripts" / script
        file.write_text("#!/usr/bin/env bash\nexit 0\n")
        file.chmod(0o755)
    for key, value in [("user.email", "t@example.com"), ("user.name", "Tester"), ("core.hooksPath", ".githooks")]:
        run_cmd(["git", "config", key, value], cwd=directory, env=environment).check()
    return directory, environment


def commit_on(run_cmd, sandbox, branch, file):
    directory, environment = sandbox
    checkout = run_cmd(["git", "checkout", "-q", "-b", branch], cwd=directory, env=environment)
    if checkout.returncode:
        run_cmd(["git", "checkout", "-q", branch], cwd=directory, env=environment).check()
    (directory / file).write_text("content\n")
    run_cmd(["git", "add", file], cwd=directory, env=environment).check()
    return run_cmd(["git", "commit", "-m", "chore: probe"], cwd=directory, env=environment)


@pytest.mark.parametrize(("branch", "accepted", "diagnostic"), [
    ("fix/anker-T002817", True, False),
    ("chore/some-other-work", False, False),
    ("chore/yet-another-branch", False, True),
    ("chore/mishap-incident-rollup", True, False),
])
def test_hook_ticketless_allowlist(run_cmd, sandbox, branch, accepted, diagnostic):
    if not accepted:
        commit_on(run_cmd, sandbox, "fix/anchor-T002817", "anchor.txt").check()
    result = commit_on(run_cmd, sandbox, branch, "probe.txt")
    if accepted:
        result.check()
    else:
        assert result.returncode != 0
        if diagnostic:
            assert any("ticket-id" in line.lower() for line in result.output.splitlines())


def test_shared_allowlist_exists(repo_root):
    assert (repo_root / "scripts/lib/branch-allowlist.sh").is_file()


@pytest.mark.parametrize(("branch", "accepted"), [
    ("chore/mishap-incident-rollup", True),
    ("chore/some-other-work", False),
    ("chore/mishap-incident-rollup-extra", False),
])
def test_allowlist_exact_branch_match(repo_root, run_cmd, branch, accepted):
    library = repo_root / "scripts/lib/branch-allowlist.sh"
    if not library.is_file():
        pytest.skip("Lib fehlt — siehe vorigen Test")
    command = f"source {shlex.quote(str(library))}; branch_is_ticketless {shlex.quote(branch)}"
    if not accepted:
        run_cmd(["bash", "-c", f"source {shlex.quote(str(library))}; branch_is_ticketless chore/mishap-incident-rollup"]).check()
    result = run_cmd(["bash", "-c", command])
    if accepted:
        result.check()
    else:
        assert result.returncode != 0


@pytest.mark.parametrize(("branch", "accepted"), [("chore/mishap-incident-rollup", False), ("fix/anker2-T002817", True)])
def test_missing_library_fails_restrictively(run_cmd, sandbox, branch, accepted):
    if not accepted:
        commit_on(run_cmd, sandbox, "fix/anchor-T002817", "anchor.txt").check()
    directory, _ = sandbox
    (directory / "scripts/lib/branch-allowlist.sh").unlink(missing_ok=True)
    result = commit_on(run_cmd, sandbox, branch, "probe.txt")
    if accepted:
        result.check()
    else:
        assert result.returncode != 0
