"""Native migration of tests/spec/divergence-guard/branch-prefix-suggestion.bats."""

import subprocess

import pytest


@pytest.fixture
def prefix_env(repo_root, tmp_path, monkeypatch):
    """BATS setup(): isolated HOME/gitconfig and a minimal repo without origin/main."""
    home = tmp_path / "home"
    home.mkdir()
    gitconfig = home / ".gitconfig"
    gitconfig.write_text("")
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("GIT_CONFIG_GLOBAL", str(gitconfig))
    main = tmp_path / "main"
    main.mkdir()
    for args in (["init", "-q", "-b", "main"], ["config", "user.email", "t@example.com"],
                 ["config", "user.name", "Tester"]):
        subprocess.run(["git", "-C", str(main), *args], check=True)
    (main / "file.txt").write_text("x\n")
    for args in (["add", "-A"], ["commit", "-qm", "init"]):
        subprocess.run(["git", "-C", str(main), *args], check=True)
    return {"helper": str(repo_root / "scripts" / "worktree-create.sh"), "main": main, "tmp": tmp_path}


def _helper(run_cmd, e, branch, wt):
    return run_cmd(["bash", "-c", f"cd '{e['main']}' && bash '{e['helper']}' {branch} '{wt}' HEAD"])


def _suggested(output):
    return "\n".join(l for l in output.splitlines() if "Suggested:" in l)


def test_t002811_konformer_chore_branch_laeuft_durch_positiv_anker(run_cmd, prefix_env):
    wt = prefix_env["tmp"] / "wt-anker"
    r = _helper(run_cmd, prefix_env, "chore/sdlc-routes-remove-T002627", wt)
    assert r.returncode == 0
    assert wt.is_dir()


def test_t002811_refactor_wird_abgelehnt_und_schlaegt_chore_vor(run_cmd, prefix_env):
    wt = prefix_env["tmp"] / "wt-refactor"
    r = _helper(run_cmd, prefix_env, "refactor/sdlc-routes-remove-T002627", wt)
    assert r.returncode != 0
    assert not wt.exists()
    assert "chore/sdlc-routes-remove-T002627" in _suggested(r.output)


def test_t002811_perf_schlaegt_ebenfalls_chore_vor(run_cmd, prefix_env):
    r = _helper(run_cmd, prefix_env, "perf/query-batching-T002811", prefix_env["tmp"] / "wt-perf")
    assert r.returncode != 0
    assert "chore/query-batching-T002811" in _suggested(r.output)


def test_t002811_bug_schlaegt_fix_vor(run_cmd, prefix_env):
    r = _helper(run_cmd, prefix_env, "bug/pocket-id-retry-T002811", prefix_env["tmp"] / "wt-bug")
    assert r.returncode != 0
    assert "fix/pocket-id-retry-T002811" in _suggested(r.output)


def test_t002811_die_abbildung_verbreitert_die_allowlist_nicht_refactor_entsteht_nicht(run_cmd, prefix_env):
    wt = prefix_env["tmp"] / "wt-widen"
    r = _helper(run_cmd, prefix_env, "refactor/sdlc-routes-remove-T002627", wt)
    assert r.returncode != 0
    assert not wt.exists()
    r = run_cmd(["bash", "-c", f"cd '{prefix_env['main']}' && git branch --list 'refactor/*'"])
    assert r.output == ""


def test_t002811_unbekanntes_praefix_bekommt_keinen_praefix_vorschlag(run_cmd, prefix_env):
    r = _helper(run_cmd, prefix_env, "wip/something-T002811", prefix_env["tmp"] / "wt-wip")
    assert r.returncode != 0
    sugg = _suggested(r.output)
    assert "wip/" not in sugg
    assert "chore/something-T002811" not in sugg
