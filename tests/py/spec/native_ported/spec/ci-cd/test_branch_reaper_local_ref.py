"""Native migration of tests/spec/ci-cd/branch-reaper-local-ref.bats."""

import os
import re
import subprocess
from pathlib import Path

import pytest


def _g(fx: Path, *args, check=True):
    return subprocess.run(["git", "-C", str(fx), *args], capture_output=True, text=True, check=check)


def _grep(text: str, pattern: str) -> str:
    return "\n".join(ln for ln in text.splitlines() if re.search(pattern, ln))


def _count(text: str, pattern: str, flags=0) -> int:
    return sum(1 for ln in text.splitlines() if re.search(pattern, ln, flags))


def _ls_remote_count(remote: Path, pattern: str) -> int:
    out = subprocess.run(["git", "ls-remote", "--heads", str(remote)], capture_output=True, text=True).stdout
    return _count(out, pattern)


def _ref_exists(fx: Path, ref: str) -> bool:
    return _g(fx, "rev-parse", "--verify", "--quiet", ref, check=False).returncode == 0


@pytest.fixture
def ctx(repo_root, tmp_path):
    fixture = tmp_path / "fixture"
    remote = tmp_path / "remote.git"
    stubs = tmp_path / "stubs"
    stubs.mkdir()
    plandir = fixture / ".agents/plans/x"

    subprocess.run(["git", "init", "--bare", "--quiet", str(remote)], check=True)
    subprocess.run(["git", "init", "--quiet", str(fixture)], check=True)
    _g(fixture, "config", "user.email", "t@example.com")
    _g(fixture, "config", "user.name", "Test")
    _g(fixture, "remote", "add", "origin", str(remote))

    plandir.mkdir(parents=True)
    (plandir / "tasks.md").write_text("base\n")
    _g(fixture, "add", "-A")
    _g(fixture, "commit", "--quiet", "-m", "base")
    _g(fixture, "push", "--quiet", "origin", "HEAD:main")

    def _branch(name):
        _g(fixture, "checkout", "--quiet", "main")
        _g(fixture, "checkout", "--quiet", "-b", name)
        (plandir / "tasks.md").write_text(name + "\n")
        _g(fixture, "commit", "--quiet", "-am", "plan only")
        _g(fixture, "push", "--quiet", "origin", name)

    _branch("chore/plan-T009001")
    _branch("chore/plan-T009002")

    _g(fixture, "checkout", "--quiet", "main")
    _g(fixture, "merge", "--quiet", "-X", "theirs", "chore/plan-T009001", "-m", "merge chore/plan-T009001")
    _g(fixture, "merge", "--quiet", "-X", "theirs", "chore/plan-T009002", "-m", "merge chore/plan-T009002")
    _g(fixture, "push", "--quiet", "origin", "main")
    _g(fixture, "checkout", "--quiet", "main")
    _g(fixture, "fetch", "--quiet", "origin")

    gh = stubs / "gh"
    gh.write_text("#!/usr/bin/env bash\necho '[]'\n")
    gh.chmod(0o755)
    ticket = stubs / "ticket-stub.sh"
    ticket.write_text("#!/usr/bin/env bash\necho '{\"status\":\"done\"}'\n")
    ticket.chmod(0o755)

    return {
        "fixture": fixture,
        "remote": remote,
        "plandir": plandir,
        "tmp": tmp_path,
        "reaper": repo_root / "scripts/branch-reaper.sh",
        "repo": repo_root,
        "env": {
            "PATH": f"{stubs}{os.pathsep}{os.environ.get('PATH', '')}",
            "TICKET_SH": str(ticket),
        },
    }


def _run(run_cmd, c, *args):
    return run_cmd(["bash", "-c", '"$@" 2>&1', "run", "bash", str(c["reaper"]), *args],
                   cwd=c["repo"], env=c["env"])


def _anchor_same_sha_reaped(run_cmd, c):
    res = _run(run_cmd, c, "--ticket", "T009001", "--repo", str(c["fixture"]))
    assert res.returncode == 0
    # DELETED-Zeile mit dem Praefix-Vertrag; der Beleg der lokalen Loeschung steht in ihr.
    dele = _grep(res.output, r"^DELETED chore/plan-T009001")
    assert dele
    assert _count(dele, "lokal", re.IGNORECASE) == 1
    # Remote-Ref weg
    assert _ls_remote_count(c["remote"], "chore/plan-T009001") == 0
    # Lokaler Ref weg
    assert not _ref_exists(c["fixture"], "chore/plan-T009001")


def test_t003182_positiv_anker_lokaler_ref_auf_identischer_sha_wird_mitentfernt(run_cmd, ctx):
    _anchor_same_sha_reaped(run_cmd, ctx)


def test_t003182_abweichender_lokaler_ref_eigene_ungepushte_arbeit_ueberlebt(run_cmd, ctx):
    _anchor_same_sha_reaped(run_cmd, ctx)

    # Lokaler Branch traegt einen nie gepushten Commit on top.
    _g(ctx["fixture"], "checkout", "--quiet", "chore/plan-T009002")
    (ctx["plandir"] / "tasks.md").write_text("lokal, nie gepusht\n")
    _g(ctx["fixture"], "commit", "--quiet", "-am", "local only")
    _g(ctx["fixture"], "checkout", "--quiet", "main")

    res = _run(run_cmd, ctx, "--ticket", "T009002", "--repo", str(ctx["fixture"]))
    assert res.returncode == 0
    kept_local = _grep(res.output, r"^KEEP local chore/plan-T009002")
    # Remote-Branch wurde geloescht.
    assert _ls_remote_count(ctx["remote"], "chore/plan-T009002") == 0
    # Der lokale Ref lebt weiter.
    assert _ref_exists(ctx["fixture"], "chore/plan-T009002")
    # Die Ausgabe begruendet das Verschonen des LOKALEN Refs.
    assert kept_local


def test_t012972_branch_mit_offenem_worktree_wird_gar_nicht_erst_geloescht(run_cmd, ctx):
    _anchor_same_sha_reaped(run_cmd, ctx)

    _g(ctx["fixture"], "worktree", "add", "--quiet", str(ctx["tmp"] / "wt2"), "chore/plan-T009002")

    res = _run(run_cmd, ctx, "--ticket", "T009002", "--repo", str(ctx["fixture"]))
    assert res.returncode == 0
    kept = _grep(res.output, r"^KEEP chore/plan-T009002")
    # Der Remote-Branch lebt.
    assert _ls_remote_count(ctx["remote"], "chore/plan-T009002") == 1
    # Der lokale Ref lebt ebenfalls.
    assert _ref_exists(ctx["fixture"], "chore/plan-T009002")
    # Die Ausgabe begruendet das Verschonen mit dem Worktree.
    assert kept
    assert _count(kept, "worktree", re.IGNORECASE) == 1


def test_t012972_branch_ohne_worktree_bleibt_faellig_guard_greift_nicht_pauschal(run_cmd, ctx):
    res = _run(run_cmd, ctx, "--ticket", "T009002", "--repo", str(ctx["fixture"]))
    assert res.returncode == 0
    assert _ls_remote_count(ctx["remote"], "chore/plan-T009002") == 0
