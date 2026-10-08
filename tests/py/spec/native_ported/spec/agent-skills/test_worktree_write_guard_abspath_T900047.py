"""Native migration of tests/spec/agent-skills/worktree-write-guard-abspath-T900047.bats."""

import json
import os
import re
import subprocess

import pytest

SID = "sid-T900047"


def _git(run_cmd, cwd, *args):
    return run_cmd(["git", *args], cwd=cwd)


@pytest.fixture
def ctx(run_cmd, repo_root, tmp_path, monkeypatch):
    """BATS setup: Sandbox-Repo, Lock-Verzeichnis mit Live-Claim, Windows-Schreibweisen."""
    bt = tmp_path / "bt"
    bt.mkdir()
    repo = bt / "repo"
    (repo / "wt-real").mkdir(parents=True)
    (repo / "wt-real/README.md").write_text("", encoding="utf-8")
    (repo / "outside.txt").write_text("", encoding="utf-8")

    _git(run_cmd, repo, "init", "-b", "main").check()
    _git(run_cmd, repo, "config", "user.email", "test@example.com").check()
    _git(run_cmd, repo, "config", "user.name", "Test User").check()
    (repo / "README.md").write_text("", encoding="utf-8")
    _git(run_cmd, repo, "add", "README.md").check()
    _git(run_cmd, repo, "commit", "-m", "chore: init").check()

    locks = bt / "locks"
    locks.mkdir()
    repo_posix = str(repo.absolute())
    (locks / "ticket__T900047.json").write_text(
        json.dumps({
            "owner_sid": SID,
            "owner_pid": "1234",
            "worktree": f"{repo_posix}/wt-real",
            "branch": "fix/demo-T900047",
            "label": "live",
        }, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )

    posix_real = f"{repo_posix}/wt-real/README.md"
    m = re.match(r"^/([A-Za-z])/(.*)$", repo_posix)
    if m:
        drive = m.group(1).upper()
        rest = m.group(2)
        win_slash = f"{drive}:/{rest}/wt-real/README.md"
        win_lower = f"{m.group(1).lower()}:{rest}/wt-real/README.md"
        posix_drive = posix_real
    else:
        win_slash = "C:" + posix_real
        win_lower = "c:" + posix_real
        posix_drive = "/c" + posix_real

    return {
        "repo": repo,
        "repo_posix": repo_posix,
        "locks": locks,
        "guard": repo_root / "scripts/hooks/worktree-write-guard.sh",
        "posix_real": posix_real,
        "posix_drive": posix_drive,
        "win_slash": win_slash,
        "win_lower": win_lower,
        "win_backslash": win_slash.replace("/", "\\"),
    }


def json_input(path: str) -> str:
    esc = path.replace("\\", "\\\\").replace('"', '\\"')
    return '{"tool_input":{"file_path":"%s"}}' % esc


def _guard(c, payload):
    """Guard mit JSON auf stdin, cwd=REPO, Lock-Umgebung wie in setup."""
    env = os.environ.copy()
    env["AGENT_LOCK_DIR"] = str(c["locks"])
    env["SID"] = SID
    env["AGENT_LOCK_SID"] = SID
    return subprocess.run(
        ["bash", str(c["guard"])],
        input=payload + "\n",
        text=True,
        capture_output=True,
        cwd=str(c["repo"]),
        env=env,
        timeout=120,
    )


def test_t1_windows_laufwerkspfad_mit_slashes_im_eigenen_worktree_erlaubt(ctx):
    assert _guard(ctx, json_input(ctx["win_slash"])).returncode == 0


def test_t2_windows_laufwerkspfad_mit_backslashes_im_eigenen_worktree_erlaubt(ctx):
    assert _guard(ctx, json_input(ctx["win_backslash"])).returncode == 0


def test_t3_kleingeschriebener_laufwerksbuchstabe_matcht_claim_pfad(ctx):
    assert _guard(ctx, json_input(ctx["win_lower"])).returncode == 0


def test_t4_unc_absoluter_pfad_wird_nicht_verstuemmelt(ctx):
    unc = r"\\testserver\share\wt-real\README.md"
    assert _guard(ctx, json_input(unc)).returncode == 0


def test_t5_posix_drive_schreibweise_bleibt_erlaubt_regression(ctx):
    assert _guard(ctx, json_input(ctx["posix_drive"])).returncode == 0


def test_t6_guard_blockt_weiterhin_positiv_anker_plus_negativ_faelle_im_selben_test(ctx):
    # Positiv-Anker: normaler POSIX-Pfad im eigenen Worktree geht durch.
    assert _guard(ctx, json_input(ctx["posix_real"])).returncode == 0
    # Negativ 1: POSIX-Pfad im Repo, aber ausserhalb des eigenen Claims, bleibt blockiert.
    assert _guard(ctx, json_input(f"{ctx['repo_posix']}/outside.txt")).returncode == 2
    # Negativ 2: Laufwerk-relativer Pfad bleibt relativ.
    assert _guard(ctx, json_input("C:relative.txt")).returncode == 2
