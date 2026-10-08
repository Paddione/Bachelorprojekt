"""Native migration of tests/spec/t002204-mishap-bundle.bats."""

# (T002204)

import os
import re
import time
from pathlib import Path

import pytest


@pytest.fixture
def ctx(repo_root: Path, run_cmd, tmp_path: Path, monkeypatch):
    home = tmp_path / "home"
    home.mkdir()
    gitconfig = home / ".gitconfig"
    gitconfig.write_text("", encoding="utf-8")
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("GIT_CONFIG_GLOBAL", str(gitconfig))
    monkeypatch.setenv("WT_SKIP_NAME_CHECK", "1")
    return {
        "repo": repo_root,
        "helper": repo_root / "scripts" / "worktree-create.sh",
        "lock": repo_root / "scripts" / "agent-lock.sh",
        "tmp": tmp_path,
        "run": run_cmd,
        "monkeypatch": monkeypatch,
    }


def _git(run, cwd: Path, *args):
    return run(["git", "-C", str(cwd), *args])


def _init_main_with_workspace_pkg(c) -> Path:
    main = c["tmp"] / "main"
    main.mkdir()
    run = c["run"]
    run(["git", "init", "-q", "-b", "main", str(main)]).check(0)
    _git(run, main, "config", "user.email", "t@example.com").check(0)
    _git(run, main, "config", "user.name", "Tester").check(0)
    (main / "components" / "brett").mkdir(parents=True)
    (main / "components" / "brett" / "pnpm-workspace.yaml").write_text(
        "allowBuilds:\n  esbuild: true\n", encoding="utf-8")
    (main / "components" / "brett" / "package.json").write_text('{"name":"brett"}\n', encoding="utf-8")
    _git(run, main, "add", "-A").check(0)
    _git(run, main, "commit", "-qm", "init").check(0)
    dep = main / "components" / "brett" / "node_modules" / "some-dep"
    dep.mkdir(parents=True)
    (dep / "package.json").write_text('{"name":"some-dep"}\n', encoding="utf-8")
    return main


def _create_wt(c, main: Path, branch: str, wt: Path, base: str):
    return c["run"](["bash", str(c["helper"]), branch, str(wt), base], cwd=main)


def test_t002204_m1_fresh_worktree_links_node_modules_for_non_website_pnpm_workspace_package(ctx):
    main = _init_main_with_workspace_pkg(ctx)
    wt = ctx["tmp"] / "wt-brett-nm"
    res = _create_wt(ctx, main, "feature/wt-brett-nm", wt, "HEAD")
    assert res.returncode == 0, res.output
    pkg = wt / "components" / "brett" / "node_modules" / "some-dep" / "package.json"
    assert pkg.exists()
    assert "some-dep" in pkg.read_text(encoding="utf-8")


def test_t002204_m1_worktree_create_still_links_root_node_modules_alongside_workspace_package(ctx):
    main = _init_main_with_workspace_pkg(ctx)
    (main / "node_modules" / "cheerio").mkdir(parents=True)
    (main / "node_modules" / "cheerio" / "package.json").write_text('{"name":"cheerio"}\n', encoding="utf-8")
    wt = ctx["tmp"] / "wt-both-nm"
    res = _create_wt(ctx, main, "feature/wt-both-nm", wt, "HEAD")
    assert res.returncode == 0, res.output
    assert (wt / "node_modules" / "cheerio" / "package.json").exists()
    assert (wt / "components" / "brett" / "node_modules" / "some-dep" / "package.json").exists()


def test_t002204_m1_worktree_create_warns_when_source_checkout_is_on_different_branch(ctx):
    main = _init_main_with_workspace_pkg(ctx)
    _git(ctx["run"], main, "checkout", "-q", "-b", "feature/mismatched-source").check(0)
    wt = ctx["tmp"] / "wt-branchcheck"
    res = _create_wt(ctx, main, "feature/wt-branchcheck", wt, "main")
    assert res.returncode == 0, res.output
    assert "WARNUNG" in res.output or "Quell-Checkout" in res.output


def _make_worktree_on_branch(c, wt: Path, branch: str) -> None:
    run = c["run"]
    wt.mkdir()
    run(["git", "init", "-q", "-b", branch, str(wt)]).check(0)
    _git(run, wt, "config", "user.email", "t@example.com").check(0)
    _git(run, wt, "config", "user.name", "Tester").check(0)
    (wt / "f.txt").write_text("x\n", encoding="utf-8")
    _git(run, wt, "add", "-A").check(0)
    _git(run, wt, "commit", "-qm", "init").check(0)


def _claim(c, lock_dir: Path, name: str, sid: str, wt: Path, branch: str):
    return c["run"](
        ["bash", str(c["lock"]), "claim", "ticket", name, "--label", "mishap2",
         "--worktree", str(wt), "--branch", branch],
        env={"AGENT_LOCK_DIR": str(lock_dir), "AGENT_LOCK_SID": sid},
    )


def test_t002204_m2_reap_keeps_lock_alive_when_worktree_on_recorded_branch_despite_dead_sid(ctx):
    wt = ctx["tmp"] / "live-wt"
    _make_worktree_on_branch(ctx, wt, "fix/t002204-demo")
    lock_dir = ctx["tmp"] / "locks"
    lock_dir.mkdir()
    _claim(ctx, lock_dir, "t002204-m2-live", "424242", wt, "fix/t002204-demo").check(0)
    lf = lock_dir / "ticket__t002204-m2-live.json"
    assert lf.is_file()

    now = int(time.time())
    text = lf.read_text(encoding="utf-8")
    text = re.sub(r'"owner_sid": "[^"]*"', '"owner_sid": "999998"', text)
    text = re.sub(r'"owner_pid": "[0-9]*"', '"owner_pid": "999999"', text)
    text = re.sub(r'"heartbeat_at": "[0-9]*"', f'"heartbeat_at": "{now}"', text)
    lf.write_text(text, encoding="utf-8")

    env = {"AGENT_LOCK_DIR": str(lock_dir)}
    ctx["run"](["bash", str(ctx["lock"]), "reap"], env=env).check(0)
    res = ctx["run"](["bash", str(ctx["lock"]), "list"], env=env)
    assert "t002204-m2-live" in res.output


def test_t002204_m2_regression_guard_reap_still_drops_lock_whose_worktree_branch_no_longer_matches(ctx):
    wt = ctx["tmp"] / "moved-wt"
    _make_worktree_on_branch(ctx, wt, "fix/t002204-demo")
    _git(ctx["run"], wt, "checkout", "-q", "-b", "some-unrelated-branch").check(0)
    lock_dir = ctx["tmp"] / "locks2"
    lock_dir.mkdir()
    _claim(ctx, lock_dir, "t002204-m2-stale", "424243", wt, "fix/t002204-demo").check(0)
    lf = lock_dir / "ticket__t002204-m2-stale.json"

    old = int(time.time()) - 100000
    text = lf.read_text(encoding="utf-8")
    text = re.sub(r'"owner_sid": "[^"]*"', '"owner_sid": "999998"', text)
    text = re.sub(r'"owner_pid": "[0-9]*"', '"owner_pid": "999999"', text)
    text = re.sub(r'"created_at": "[0-9]*"', f'"created_at": "{old}"', text)
    text = re.sub(r'"heartbeat_at": "[0-9]*"', f'"heartbeat_at": "{old}"', text)
    lf.write_text(text, encoding="utf-8")

    env = {"AGENT_LOCK_DIR": str(lock_dir)}
    ctx["run"](["bash", str(ctx["lock"]), "reap"], env=env).check(0)
    res = ctx["run"](["bash", str(ctx["lock"]), "list"], env=env)
    assert "t002204-m2-stale" not in res.output


def test_t002239_m3_guard_pnpm_install_sh_exists_and_is_executable(ctx):
    guard = ctx["repo"] / "scripts" / "guard-pnpm-install.sh"
    assert guard.is_file(), "scripts/guard-pnpm-install.sh not found"
    assert os.access(guard, os.X_OK), "scripts/guard-pnpm-install.sh is not executable"


def test_t002239_m3_guard_refuses_pnpm_install_when_node_modules_is_a_symlink(ctx):
    guard = ctx["repo"] / "scripts" / "guard-pnpm-install.sh"
    m3 = ctx["tmp"] / "m3"
    (m3 / "components" / "website" / "node_modules" / ".pnpm").mkdir(parents=True)
    res = ctx["run"](["bash", str(guard), str(m3 / "components" / "website")])
    assert res.returncode == 0, res.output

    nm = m3 / "components" / "website" / "node_modules"
    for child in sorted(nm.rglob("*"), reverse=True):
        child.rmdir() if child.is_dir() else child.unlink()
    nm.rmdir()
    (m3 / "real-nm").mkdir()
    nm.symlink_to(m3 / "real-nm")
    res = ctx["run"](["bash", str(guard), str(m3 / "components" / "website")])
    assert res.returncode != 0, "guard did not refuse (exit 0)"
    assert re.search(r"refus", res.output, re.IGNORECASE), f"guard output missing 'refus': {res.output}"


def test_t002239_m3_worktree_create_sh_source_references_guard_pnpm_install_sh(ctx):
    text = ctx["helper"].read_text(encoding="utf-8")
    assert "guard-pnpm-install" in text, "worktree-create.sh does not mention guard-pnpm-install.sh"
