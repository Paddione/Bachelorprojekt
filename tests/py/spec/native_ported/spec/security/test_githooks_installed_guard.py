"""Native migration of tests/spec/security/githooks-installed-guard.bats."""

import subprocess

GUARD = "scripts/check-hooks-path.sh"


def _git_init(run_cmd, path):
    path.mkdir(parents=True, exist_ok=True)
    r = run_cmd(["git", "-C", str(path), "init", "-q"])
    assert r.returncode == 0, r.output


def _guard_in(run_cmd, repo_root, sandbox):
    return run_cmd(["bash", "-c", f"cd '{sandbox}' && env -u CI -u GITHUB_ACTIONS bash '{repo_root / GUARD}'"])


def test_check_hooks_path_exits_0_in_ci(run_cmd, repo_root):
    r = run_cmd(["bash", str(repo_root / GUARD)], env={"CI": "true"})
    assert r.returncode == 0, r.output


def test_check_hooks_path_fails_when_core_hooks_path_is_unset(run_cmd, repo_root, tmp_path):
    sandbox = tmp_path / "hooks-unset"
    _git_init(run_cmd, sandbox)
    subprocess.run(["git", "-C", str(sandbox), "config", "--unset-all", "core.hooksPath"],
                   stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    r = _guard_in(run_cmd, repo_root, sandbox)
    assert r.returncode != 0, r.output
    assert "core.hooksPath is not set" in r.output
    assert "task hooks:install" in r.output


def test_check_hooks_path_passes_when_core_hooks_path_points_to_valid_hooks_directory_positiv_anker(run_cmd, repo_root, tmp_path):
    sandbox = tmp_path / "hooks-valid"
    (sandbox / ".githooks").mkdir(parents=True)
    (sandbox / ".githooks" / "pre-commit").touch()
    _git_init(run_cmd, sandbox)
    r = run_cmd(["git", "-C", str(sandbox), "config", "core.hooksPath", ".githooks"])
    assert r.returncode == 0, r.output
    r = _guard_in(run_cmd, repo_root, sandbox)
    assert r.returncode == 0, r.output
    assert "core.hooksPath is configured and active" in r.output


def test_check_hooks_path_fails_when_core_hooks_path_points_to_non_existent_directory(run_cmd, repo_root, tmp_path):
    sandbox = tmp_path / "hooks-broken"
    _git_init(run_cmd, sandbox)
    r = run_cmd(["git", "-C", str(sandbox), "config", "core.hooksPath", ".nonexistent-hooks"])
    assert r.returncode == 0, r.output
    r = _guard_in(run_cmd, repo_root, sandbox)
    assert r.returncode != 0, r.output
    assert "directory does not exist" in r.output
