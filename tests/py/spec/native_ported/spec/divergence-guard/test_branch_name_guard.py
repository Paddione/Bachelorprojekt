"""Native migration of tests/spec/divergence-guard/branch-name-guard.bats."""

import re
import shutil
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


def test_t002470_kleingeschriebene_ticket_id_wird_abgelehnt_kein_worktree_entsteht(run_cmd, guard_env):
    wt = guard_env["tmp"] / "wt-lower"
    r = _helper(run_cmd, guard_env, "chore/mishap-t002407", wt)
    assert r.returncode != 0
    assert not wt.exists()


def test_t002470_kurzform_ohne_6_stellige_id_wird_abgelehnt(run_cmd, guard_env):
    wt = guard_env["tmp"] / "wt-short"
    r = _helper(run_cmd, guard_env, "feature/t2450-loc-gates", wt)
    assert r.returncode != 0
    assert not wt.exists()


def test_t002470_ungueltiges_typ_praefix_feat_wird_abgelehnt(run_cmd, guard_env):
    wt = guard_env["tmp"] / "wt-feat"
    r = _helper(run_cmd, guard_env, "feat/auto-triage-T002399", wt)
    assert r.returncode != 0
    assert not wt.exists()


def test_t002470_die_meldung_benennt_die_verletzte_bedingung_einzeln(run_cmd, guard_env):
    # Positiv-Anker: der konforme Name laeuft durch.
    r = _helper(run_cmd, guard_env, "fix/anker-T002470", guard_env["tmp"] / "wt-anker")
    assert r.returncode == 0

    r = _helper(run_cmd, guard_env, "chore/mishap-t002407", guard_env["tmp"] / "wt-msg")
    assert r.returncode != 0
    assert any(re.search(r"ticket-id|ticket_id", l, re.I) and "T002407" in l for l in r.output.splitlines())


def test_t002470_die_meldung_schlaegt_den_korrigierten_aufruf_vor(run_cmd, guard_env):
    r = _helper(run_cmd, guard_env, "chore/mishap-t002407", guard_env["tmp"] / "wt-sug")
    assert r.returncode != 0
    assert "chore/mishap-T002407" in r.output


def test_t002470_der_guard_greift_auch_fuer_einen_bereits_existierenden_branch(run_cmd, guard_env):
    subprocess.run(["git", "-C", str(guard_env["main"]), "branch", "chore/mishap-t002424"], check=True)
    wt = guard_env["tmp"] / "wt-exists"
    r = _helper(run_cmd, guard_env, "chore/mishap-t002424", wt)
    assert r.returncode != 0
    assert not wt.exists()


def test_t002470_ein_abgelehnter_name_loest_keinen_stash_im_hauptcheckout_aus(run_cmd, guard_env):
    main = guard_env["main"]
    with open(main / "file.txt", "a") as fh:
        fh.write("uncommitted\n")
    stash_list = lambda: subprocess.run(["git", "-C", str(main), "stash", "list"],  # noqa: E731
                                        capture_output=True, text=True, check=True).stdout
    before = len(stash_list().splitlines())
    r = _helper(run_cmd, guard_env, "chore/mishap-t002407", guard_env["tmp"] / "wt-nostash")
    assert r.returncode != 0
    after = len(stash_list().splitlines())
    assert before == after
    assert "uncommitted" in (main / "file.txt").read_text()


def test_t002470_ein_konventionskonformer_name_legt_weiterhin_einen_worktree_an(run_cmd, guard_env):
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
    r = _helper(run_cmd, guard_env, "chore/mishap-t002407", wt, extra_env={"WT_SKIP_NAME_CHECK": "1"})
    assert r.returncode == 0
    assert wt.is_dir()


def test_t002817_hook_und_helper_folgen_derselben_allowlist_quelle(run_cmd, guard_env, repo_root, monkeypatch):
    tmp = guard_env["tmp"]
    lib = repo_root / "scripts" / "lib" / "branch-allowlist.sh"
    assert lib.is_file()

    sb = tmp / "shared"
    (sb / ".githooks").mkdir(parents=True)
    (sb / "scripts" / "lib").mkdir(parents=True)
    for args in (["init", "-q", "-b", "main"], ["config", "user.email", "t@example.com"],
                 ["config", "user.name", "Tester"], ["config", "core.hooksPath", ".githooks"]):
        subprocess.run(["git", "-C", str(sb), *args], check=True)
    shutil.copy(guard_env["hook"], sb / ".githooks" / "pre-commit")
    shutil.copy(guard_env["helper"], sb / "scripts" / "worktree-create.sh")
    if (repo_root / ".gitleaks.toml").is_file():
        shutil.copy(repo_root / ".gitleaks.toml", sb / ".gitleaks.toml")
    text = lib.read_text(encoding="utf-8")
    text = re.sub(r"(?m)^TICKETLESS_BRANCHES=.*$", 'TICKETLESS_BRANCHES="chore/probe-shared-source"', text)
    (sb / "scripts" / "lib" / "branch-allowlist.sh").write_text(text)
    for s in ("agent-lock.sh", "agent-collision.sh", "git-crypt-guard.sh",
              "plan-half-archive-check.sh", "plan-main-staging-guard.sh"):
        p = sb / "scripts" / s
        p.write_text("#!/usr/bin/env bash\nexit 0\n")
        p.chmod(0o755)
    monkeypatch.setenv("FRESHNESS_HOOK_DISABLED", "1")

    (sb / "base.txt").write_text("base\n")
    subprocess.run(["git", "-C", str(sb), "add", "base.txt"], check=True)
    subprocess.run(["git", "-C", str(sb), "commit", "-q", "--no-verify", "-m", "chore: base"], check=True)

    # Positiv-Anker: der Guard wirkt ueberhaupt.
    subprocess.run(["git", "-C", str(sb), "checkout", "-q", "-b", "chore/nicht-in-der-liste"], check=True)
    (sb / "anchor.txt").write_text("x\n")
    subprocess.run(["git", "-C", str(sb), "add", "anchor.txt"], check=True)
    r = run_cmd(["git", "-C", str(sb), "commit", "-m", "chore: anker"])
    assert r.returncode != 0

    subprocess.run(["git", "-C", str(sb), "checkout", "-q", "-b", "chore/probe-shared-source"], check=True)
    r = run_cmd(["git", "-C", str(sb), "commit", "-m", "chore: probe"])
    assert r.returncode == 0

    subprocess.run(["git", "-C", str(sb), "checkout", "-q", "main"], check=True)
    wt = tmp / "wt-shared"
    r = run_cmd(["bash", "-c", f"cd '{sb}' && bash scripts/worktree-create.sh --unattended chore/probe-shared-source '{wt}' HEAD"])
    assert r.returncode == 0
    assert wt.is_dir()

    for f in (sb / ".githooks" / "pre-commit", sb / "scripts" / "worktree-create.sh"):
        assert "probe-shared-source" not in f.read_text(encoding="utf-8")
