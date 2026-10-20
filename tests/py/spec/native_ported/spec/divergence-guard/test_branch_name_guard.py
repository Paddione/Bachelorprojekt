"""Native migration of tests/spec/divergence-guard/branch-name-guard.bats."""

import subprocess

import pytest


@pytest.fixture
def guard_env(repo_root, tmp_path, monkeypatch):
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
    return {"repo": repo_root, "helper": str(repo_root / "scripts" / "worktree-create.sh"),
            "hook": repo_root / ".githooks" / "pre-commit", "tmp": tmp_path, "main": main,
            "home": home, "gitconfig": gitconfig}


def _helper(run_cmd, g, branch, wt, extra_env=None, tail=""):
    env = dict(extra_env or {})
    return run_cmd(["bash", "-c", f"cd '{g['main']}' && {env_prefix(env)}bash '{g['helper']}' {branch} '{wt}' HEAD{tail}"])


def env_prefix(env):
    return "".join(f"{k}={v} " for k, v in env.items())


def test_ticketloser_name_mit_typ_praefix_legt_einen_worktree_an(run_cmd, guard_env):
    # Die Ticket-ID-Pflicht ist entfallen: Typ-Praefix genuegt.
    wt = guard_env["tmp"] / "wt-noticket"
    r = _helper(run_cmd, guard_env, "chore/mishap-rollup", wt)
    assert r.returncode == 0, r.output
    assert wt.is_dir()


def test_t002470_ungueltiges_typ_praefix_feat_wird_abgelehnt(run_cmd, guard_env):
    wt = guard_env["tmp"] / "wt-feat"
    r = _helper(run_cmd, guard_env, "feat/auto-triage", wt)
    assert r.returncode != 0
    assert not wt.exists()


def test_t002470_die_meldung_benennt_die_verletzte_bedingung(run_cmd, guard_env):
    # Positiv-Anker: der konforme Name laeuft durch.
    r = _helper(run_cmd, guard_env, "fix/anker", guard_env["tmp"] / "wt-anker")
    assert r.returncode == 0

    r = _helper(run_cmd, guard_env, "experiment/foo", guard_env["tmp"] / "wt-msg")
    assert r.returncode != 0
    assert any("Typ-Praefix" in l for l in r.output.splitlines())


def test_t002811_die_meldung_schlaegt_das_konforme_praefix_vor(run_cmd, guard_env):
    r = _helper(run_cmd, guard_env, "feat/auto-triage", guard_env["tmp"] / "wt-sug")
    assert r.returncode != 0
    assert "feature/auto-triage" in r.output


def test_t002470_der_guard_greift_auch_fuer_einen_bereits_existierenden_branch(run_cmd, guard_env):
    subprocess.run(["git", "-C", str(guard_env["main"]), "branch", "experiment/bestehend"], check=True)
    wt = guard_env["tmp"] / "wt-exists"
    r = _helper(run_cmd, guard_env, "experiment/bestehend", wt)
    assert r.returncode != 0
    assert not wt.exists()


def test_t002470_ein_abgelehnter_name_loest_keinen_stash_im_hauptcheckout_aus(run_cmd, guard_env):
    main = guard_env["main"]
    with open(main / "file.txt", "a") as fh:
        fh.write("uncommitted\n")
    stash_list = lambda: subprocess.run(["git", "-C", str(main), "stash", "list"],  # noqa: E731
                                        capture_output=True, text=True, check=True).stdout
    before = len(stash_list().splitlines())
    r = _helper(run_cmd, guard_env, "experiment/foo", guard_env["tmp"] / "wt-nostash")
    assert r.returncode != 0
    after = len(stash_list().splitlines())
    assert before == after
    assert "uncommitted" in (main / "file.txt").read_text()


def test_t002470_ein_name_mit_ticket_id_legt_weiterhin_einen_worktree_an(run_cmd, guard_env):
    wt = guard_env["tmp"] / "wt-ok"
    r = _helper(run_cmd, guard_env, "fix/branch-name-guard-T002470", wt)
    assert r.returncode == 0
    assert wt.is_dir()


def test_t002470_renovate_ist_vom_guard_ausgenommen(run_cmd, guard_env):
    wt = guard_env["tmp"] / "wt-ren"
    r = _helper(run_cmd, guard_env, "renovate/npm-lodash", wt)
    assert r.returncode == 0
    assert wt.is_dir()


def test_t002470_worktree_create_skip_name_check_1_laesst_einen_verletzenden_namen_durch(run_cmd, guard_env):
    wt = guard_env["tmp"] / "wt-bypass"
    r = _helper(run_cmd, guard_env, "experiment/foo", wt, extra_env={"WT_SKIP_NAME_CHECK": "1"})
    assert r.returncode == 0
    assert wt.is_dir()


def test_t001936_nicht_konformer_pfad_wird_unter_den_agent_worktree_root_umgeleitet(run_cmd, guard_env):
    root = guard_env["tmp"] / "agent-worktrees"
    r = _helper(run_cmd, guard_env, "fix/umleitung", "wt-relativ",
                extra_env={"AGENT_WORKTREE_ROOT": str(root)})
    assert r.returncode == 0, r.output
    assert (root / "main" / "fix" / "umleitung").is_dir()
    assert not (guard_env["main"] / "wt-relativ").exists()
