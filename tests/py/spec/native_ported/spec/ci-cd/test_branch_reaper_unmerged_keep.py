"""Native migration of tests/spec/ci-cd/branch-reaper-unmerged-keep.bats."""

import os
import re
import subprocess
from pathlib import Path

import pytest


def _g(fx: Path, *args, check=True):
    return subprocess.run(["git", "-C", str(fx), *args], capture_output=True, text=True, check=check)


def _grep(text: str, pattern: str) -> str:
    return "\n".join(ln for ln in text.splitlines() if re.search(pattern, ln))


@pytest.fixture
def ctx(repo_root, tmp_path):
    fixture = tmp_path / "fixture"
    remote = tmp_path / "remote.git"
    stubs = tmp_path / "stubs"
    stubs.mkdir()
    plandir = fixture / ".agents/plans/x"

    subprocess.run(["git", "init", "--bare", "--quiet", str(remote)], check=True)
    subprocess.run(["git", "init", "-b", "main", "--quiet", str(fixture)], check=True)
    _g(fixture, "config", "user.email", "t@example.com")
    _g(fixture, "config", "user.name", "Test")
    _g(fixture, "remote", "add", "origin", str(remote))

    plandir.mkdir(parents=True)
    (plandir / "tasks.md").write_text("base\n")
    _g(fixture, "add", "-A")
    _g(fixture, "commit", "--quiet", "-m", "base")
    _g(fixture, "push", "--quiet", "origin", "HEAD:main")

    # Gemergter Branch mit reiner Allowlist-Abweichung: Tip ist Ancestor von Remote-main.
    _g(fixture, "checkout", "--quiet", "-b", "chore/merged-T900101")
    (plandir / "tasks.md").write_text("merged\n")
    _g(fixture, "commit", "--quiet", "-am", "plan only")
    _g(fixture, "push", "--quiet", "origin", "chore/merged-T900101")
    _g(fixture, "checkout", "--quiet", "main")
    _g(fixture, "merge", "--quiet", "--no-ff", "chore/merged-T900101", "-m", "merge merged")
    _g(fixture, "push", "--quiet", "origin", "main")

    # Ungemergter Branch mit voll allowlisted Blob-Diff: nur der Guard haelt ihn zurueck.
    _g(fixture, "checkout", "--quiet", "-b", "chore/unmerged-T900102")
    (plandir / "tasks.md").write_text("unmerged\n")
    _g(fixture, "commit", "--quiet", "-am", "plan only")
    _g(fixture, "push", "--quiet", "origin", "chore/unmerged-T900102")
    _g(fixture, "checkout", "--quiet", "main")
    _g(fixture, "fetch", "--quiet", "origin")

    gh = stubs / "gh"
    gh.write_text("#!/usr/bin/env bash\necho '[]'\n")
    ticket = stubs / "ticket-stub.sh"
    ticket.write_text("#!/usr/bin/env bash\necho '{\"status\":\"done\"}'\n")
    gh.chmod(0o755)
    ticket.chmod(0o755)

    return {
        "fixture": fixture,
        "reaper": repo_root / "scripts/branch-reaper.sh",
        "repo": repo_root,
        "env": {
            "PATH": f"{stubs}{os.pathsep}{os.environ.get('PATH', '')}",
            "TICKET_SH": str(ticket),
        },
    }


def _run(run_cmd, c, *args):
    return run_cmd(["bash", str(c["reaper"]), *args], cwd=c["repo"], env=c["env"])


def test_t900096_positiv_anker_voll_gemergter_allowlist_branch_liefert_genau_eine_reap_zeile(run_cmd, ctx):
    res = _run(run_cmd, ctx, "--dry-run", "--ticket", "T900101", "--repo", str(ctx["fixture"]))
    assert res.returncode == 0
    reaped = _grep(res.output, r"^REAP ")
    assert len([ln for ln in reaped.splitlines() if ln.strip()]) == 1
    assert len([ln for ln in reaped.splitlines() if "chore/merged-T900101" in ln]) == 1


def test_t900096_branch_mit_commits_ausserhalb_main_wird_behalten(run_cmd, ctx):
    res = _run(run_cmd, ctx, "--dry-run", "--ticket", "T900102", "--repo", str(ctx["fixture"]))
    assert res.returncode == 0
    # Der Allowlist-Diff allein darf NICHT freigeben: keine REAP-Zeile.
    assert _grep(res.output, r"^REAP ") == ""
    keep = _grep(res.output, r"^KEEP chore/unmerged-T900102")
    assert keep
    # Unmerged-Begruendung im T900096-Kontext.
    assert "ausserhalb" in keep
    assert "T900096" in keep


def test_t900096_ein_lauf_sieht_beide_faelle_gemergt_reap_ungemergt_keep(run_cmd, ctx):
    # Ticketloser Inspektionsblick (--dry-run ohne --ticket): bewertet beide Branches in EINEM Lauf.
    res = _run(run_cmd, ctx, "--dry-run", "--repo", str(ctx["fixture"]))
    assert res.returncode == 0
    reaped = _grep(res.output, r"^REAP ")
    assert len([ln for ln in reaped.splitlines() if "chore/merged-T900101" in ln]) == 1
    assert _grep(reaped, "chore/unmerged-T900102") == ""
    assert re.search(r"^KEEP chore/unmerged-T900102.*T900096", res.output, re.M)
