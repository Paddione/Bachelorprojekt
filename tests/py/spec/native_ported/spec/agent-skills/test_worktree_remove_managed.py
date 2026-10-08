"""Native migration of tests/spec/agent-skills/worktree-remove-managed.bats."""

import re

import pytest


@pytest.fixture
def sandbox(run_cmd, tmp_path, monkeypatch):
    """BATS setup: Sandbox-Repo mit Init-Commit."""
    repo = tmp_path / "repo"
    repo.mkdir()
    monkeypatch.setenv("GIT_AUTHOR_NAME", "t")
    monkeypatch.setenv("GIT_AUTHOR_EMAIL", "t@example.invalid")
    monkeypatch.setenv("GIT_COMMITTER_NAME", "t")
    monkeypatch.setenv("GIT_COMMITTER_EMAIL", "t@example.invalid")
    run_cmd(["git", "-C", str(repo), "init", "-q", "."]).check()
    run_cmd(["git", "-C", str(repo), "commit", "-q", "--allow-empty", "-m", "init"]).check()
    return repo


@pytest.fixture
def paths(repo_root):
    return {
        "lib": repo_root / "scripts/lib/worktree-remove.sh",
        "finalize": repo_root / "scripts/devflow-post-merge-finalize.sh",
        "repo_root": repo_root,
    }


def _locked_wt(run_cmd, sandbox, wt, branch):
    run_cmd(["git", "-C", str(sandbox), "worktree", "add", "-q", "-b", branch, str(wt)]).check()
    run_cmd(["git", "-C", str(sandbox), "worktree", "lock", str(wt), "--reason", "managed agent worktree"]).check()


def _registered(run_cmd, sandbox, wt):
    out = run_cmd(["git", "-C", str(sandbox), "worktree", "list", "--porcelain"]).stdout.splitlines()
    return f"worktree {wt}" in out


def test_t900340_gesperrter_worktree_wird_vom_helper_entfernt(run_cmd, paths, sandbox):
    wt = sandbox / ".worktrees/locked1"
    _locked_wt(run_cmd, sandbox, wt, "b-locked1")
    r = run_cmd(["bash", "-c", f"source '{paths['lib']}' && worktree_remove_managed '{sandbox}' '{wt}'"])
    assert r.returncode == 0, r.output
    assert not wt.exists()
    assert not _registered(run_cmd, sandbox, wt)


def test_t900340_ungesperrter_worktree_wird_ebenfalls_entfernt(run_cmd, paths, sandbox):
    wt = sandbox / ".worktrees/plain1"
    run_cmd(["git", "-C", str(sandbox), "worktree", "add", "-q", "-b", "b-plain1", str(wt)]).check()
    r = run_cmd(["bash", "-c", f"source '{paths['lib']}' && worktree_remove_managed '{sandbox}' '{wt}'"])
    assert r.returncode == 0, r.output
    assert not wt.exists()


def test_t900340_nicht_registrierter_pfad_wird_abgewiesen_und_bleibt_stehen(run_cmd, paths, sandbox):
    d = sandbox / ".worktrees/fremd"
    d.mkdir(parents=True)
    # Positiv-Anker: der Helper existiert und ist aufrufbar.
    r = run_cmd(["bash", "-c", f"source '{paths['lib']}' && declare -F worktree_remove_managed"])
    assert r.returncode == 0, r.output
    r = run_cmd(["bash", "-c", f"source '{paths['lib']}' && worktree_remove_managed '{sandbox}' '{d}'"])
    assert r.returncode != 0
    assert d.is_dir()


def test_t900340_finalize_schritt_10_entfernt_einen_gesperrten_worktree(run_cmd, paths, sandbox):
    wt = sandbox / ".worktrees/final1"
    _locked_wt(run_cmd, sandbox, wt, "b-final1")
    helper = paths["repo_root"] / "scripts/lib/finalize-step-guards.sh"
    assert 'finalize_remove_clean_worktree "$REPO_DIR" "$WORKTREE"' in paths["finalize"].read_text()
    r = run_cmd(["bash", "-c", f"source '{helper}'; finalize_remove_clean_worktree '{sandbox}' '{wt}'"])
    assert r.returncode == 0, r.output
    assert not wt.exists()
    assert not _registered(run_cmd, sandbox, wt)


def test_t900340_aufrufer_entfernen_worktrees_nur_ueber_den_helper(paths):
    # T900399: Der Factory-Cleanup-Helper steht bewusst nicht mehr in der Caller-Liste.
    for rel in (
        "scripts/devflow-post-merge-finalize.sh",
        "scripts/pr-refresh.sh",
        "scripts/weekly-dep-schema-audit.sh",
    ):
        text = (paths["repo_root"] / rel).read_text(encoding="utf-8")
        # Positiv-Anker: die Datei nutzt den Helper ueberhaupt.
        helper = "finalize_remove_clean_worktree" if rel.endswith("devflow-post-merge-finalize.sh") else "worktree_remove_managed"
        assert helper in text, rel
        bare = []
        for n, line in enumerate(text.splitlines(), 1):
            if "worktree remove" not in line:
                continue
            if re.match(r"^\s*#", line) or re.match(r"^\s*echo ", line):
                continue
            bare.append(f"{n}:{line}")
        assert not bare, f"{rel}: " + "\n".join(bare)


